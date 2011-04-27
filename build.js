
var Fs = require("fs"),
	Path = require("path"),
	Util = require("util"),
	exec = require('child_process').exec,
	spawn = require('child_process').spawn,
	async = require("./deps/async.js/lib/async");

require("./deps/async.js/lib/plugins/fs-node");

var verbose = false,
	mode = process.argv[2] || "--help";

function mkdirs(dirname, mode, callback) {
	if(typeof mode === 'function') {
		callback = mode;
		mode = undefined;
	}
	
	if(mode === undefined) {
		mode = 0x1ff ^ process.umask();
	}
	
	var pathsCreated = [],
		pathsFound = [],
	makeNext = function() {
		var fn = pathsFound.pop();
		if (!fn) {
			if (callback) callback(null, pathsCreated);
		}
		else {
			Fs.mkdir(fn, mode, function(err) {
				if (!err) {
					pathsCreated.push(fn);
					makeNext();
				}
				else if (callback) {
					callback(err);
				}
			});
		}
	},
	findNext = function(fn){
		Fs.stat(fn, function(err, stats) {
			if (err) {
				if (err.code === 'ENOENT') {
					pathsFound.push(fn);
					findNext(Path.dirname(fn));
				}
				else if (callback) {
					callback(err);
				}
			}
			else if (stats.isDirectory()) {
				// create all dirs we found up to this dir
				makeNext();
			}
			else {
				if (callback) {
					callback(new Error('Unable to create directory at '+fn));
				}
			}
		});
	};
	
	findNext(dirname);
}

function copy(src, dest, callback) {
	src = Path.normalize(src);
	dest = Path.normalize(dest);
	if(typeof callback !== "function") {
		callback = function(err) {
			if(err) throw new Error("copy('"+src+"', '"+dest+"')\n"+err);
		};
	}
	
	Fs.stat(dest, function(err, dest_st) {
		if(err) {
			if(err.code === 'ENOENT') {
				async.copyfile(src, dest, false, callback);
			} else callback(err);
		} else {
			Fs.stat(src, function(err, src_st) {
				if(err) callback(err);
				if(src_st.mtime.getTime() != dest_st.mtime.getTime()) {
					async.copyfile(src, dest, true, callback);
				}
			});
		}
	});
}

function symlink(src, dest, callback) {
	src = Path.resolve(src);
	dest = Path.normalize(dest);
	if(typeof callback !== "function") {
		callback = function(err) {
			if(err) throw new Error("symlink('"+src+"', '"+dest+"')\n"+err);
		};
	}
	
	Fs.lstat(dest, function(err, dest_st) {
		if(err) {
			if(err.code === 'ENOENT') {
				Fs.symlink(src, dest, callback);
			} else {
				callback(err);
			}
		} else if(dest_st.isSymbolicLink()) {
			callback(Fs.readlinkSync(dest) == src ? null : new Error("symlink exists and points to something else"));
		} else {
			callback(new Error("destination exists and is not a symlink"));
		}
	});
}

function copy_dll(src, dest, callback) {
	var ext = Path.extname(src);
	var base_src = src.substr(0, src.length - ext.length);
	var base_dest = dest.substr(0, dest.length - ext.length);
	
	switch(process.platform) {
		case "darwin":
			copy(base_src+".dylib", base_dest+".dylib", callback);
			break;
		
		case "linux":
			copy(base_src+".so", base_dest+".so", callback);
			break;
			
		default:
			console.log("platform '"+process.platform+"' is not yet supported"); 
	}
}

switch(mode) {
	case "--help":
		console.log("something of help here");
		break;
		
	case "--prepare-libav":
		mkdirs('build/lib', function(err) {
			copy_dll('deps/libav/libavformat/libavformat.so', 'build/lib/libavformat.so');
			copy_dll('deps/libav/libavcodec/libavcodec.so', 'build/lib/libavcodec.so');
			copy_dll('deps/libav/libavutil/libavutil.so', 'build/lib/libavutil.so');
		});
		
		break;
		
	case "--prepare-libtorrent":
		mkdirs('build/lib', function(err) {
			copy_dll('build/default/libtorrent.so', 'build/lib/libtorrent.so');
		});
		
		break;
	
	case "--prepare-playbox":
		mkdirs('build/lib', function(err) {
			copy('build/default/playbox.node', 'build/lib/playbox.node');
		});
		
		break;
	
	case "--make-release":
		mkdirs('build/release/lib', function(err) {
			// build libs
			copy_dll('build/lib/libtorrent.so', 'build/release/lib/libtorrent.so');
			copy_dll('build/lib/libavformat.so', 'build/release/lib/libavformat.so');
			copy_dll('build/lib/libavcodec.so', 'build/release/lib/libavcodec.so');
			copy_dll('build/lib/libavutil.so', 'build/release/lib/libavutil.so');

			// node libs
			copy('build/default/playbox.node', 'build/release/lib/playbox.node');
			
			// js libs
			symlink('deps/socket.io', 'build/release/lib/socket.io');
			symlink('deps/async.js/lib', 'build/release/lib/async.js');
			symlink('deps/node-id3/lib/id3', 'build/release/lib/node-id3'); //TODO: change this over to music-metadata (or whatever it was)
			symlink('deps/node-strtok/lib', 'build/release/lib/node-strtok');
			symlink('deps/node-uuid', 'build/release/lib/node-uuid');
			symlink('deps/sha1_stream/sha1_stream.js', 'build/release/lib/sha1_stream.js');
			//symlink('deps/long-stack-traces/lib/long-stack-traces.js', 'build/release/lib/long-stack-traces.js');
			symlink('deps/requirejs/require.js', 'build/release/require.js');
			symlink('deps/requirejs/require', 'build/release/require');
			
			symlink('public', 'build/release/public');

			// main app
			symlink('main.js', 'build/release/main.js');
			symlink('connection.js', 'build/release/connection.js');
			symlink('edb.js', 'build/release/lib/edb.js');
			symlink('poem', 'build/release/poem');
			
			// lib files
			//TODO: traverse the directory and symlink each...
			symlink('lib/bencode.js', 'build/release/lib/bencode.js');
			symlink('lib/http.js', 'build/release/lib/http.js');
			symlink('lib/poem.js', 'build/release/lib/poem.js');
			

			symlink('config.json', 'build/release/config.json');
			symlink('applist.json', 'build/release/applist.json');
		});

		// default apps
		mkdirs('build/release/apps', function(err) {
			symlink('apps/poem', 'build/release/apps/poem');
			symlink('apps/playbox', 'build/release/apps/playbox');

			// js lib: APF (ajax.org)
			/*
			mkdirs('build/release/apps/apf/public', function(err) {
				symlink('deps/apf/apf.js', 'build/release/apps/apf/public/apf.js');
				symlink('deps/apf/loader.js', 'build/release/apps/apf/public/loader.js');
				symlink('deps/apf/core', 'build/release/apps/apf/public/core');
				symlink('deps/apf/elements', 'build/release/apps/apf/public/elements');
				symlink('deps/apf/processinginstructions', 'build/release/apps/apf/public/processinginstructions');
			});
			*/

			// js lib: jPlayer (http://www.jplayer.org)
			mkdirs('build/release/apps/jPlayer/public', function(err) {
				symlink('deps/jPlayer/jquery.jplayer/jquery.jplayer.js', 'build/release/apps/jPlayer/public/jplayer.js');
				symlink('deps/jPlayer/jquery.jplayer/Jplayer.swf', 'build/release/apps/jPlayer/public/Jplayer.swf');
			});
		});
		
		break;
}
