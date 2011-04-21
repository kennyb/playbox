"use strict";

var Sys = require("sys"),
	Fs = require('fs'),
	Path = require('path'),
	Crypto = require("crypto"),
	ID3File = require("lib/node-id3"),
	bencode = require("lib/bencode"),
	DataStore = require("lib/poem").DataStore, //TODO: move DataStore over to be a global in the context
	ext2mime = require('lib/http').ext2mime;

var playbox = new Playbox(),
	add_archive_queue = [],
	load_metadata_queue = [],
	update_loop = null,
	tmp_file_id = 0,
	last_idle = 0,
	config = {
		read_kb_speed: 50000,
		write_kb_speed: 30000
	};

var Directory = function() {
	var ds = new DataStore("playbox.dir");
	// for now, I'm just going to do these manually, but I think having an event subscription system to where the html
	// interface can subscribe/unsubscribe to data updates by providing a "query" in which to only see
	// perhaps, I could cache the "window" it sees, and just send the "difference" out to the interface...
	// of course custom events could be defined too
	
	ds.on("load", function(d) {
		(new Directory(d._id)).update({"$concat": {queued: d.archives.concat(d.processing)}, processing: [], archives:[]});
	}).on("add", function(d) {
		emit_event("dir_added", d);
	}).on("remove", function(id) {
		emit_event("dir_removed", id);
	}).on("update", function(d) {
		emit_event("dir_updated", d);
	});
	
	var add_dir_recursive = function(p, root) {
		Fs.stat(p, function(err, st) {
			if(err) throw err;
			
			if(st.isFile() && Path.extname(p) === ".mp3" && st.size < 11 * 1024 * 1024) {
				ds.update(root, {"$push": {queued: p}});
			} else if(st.isDirectory()) {
				Fs.readdir(p, function(err, files) {
					if(err) throw err;
					
					var i = files.length-1;
					if(i >= 0) {
						do {
							add_dir_recursive(p+"/"+files[i], root);
						} while(i--);
					}
				});
			}
		});
	};
	
	var Directory = function(path) {
		path = Path.normalize(path);
		var self = this;
		
		var dir = ds.findOne({"_id": function(v) {return typeof v === 'string' && v.indexOf(path) === 0}});
		if(!dir) {
			ds.add(path, {
				queued: [],
				archives: [],
				errors: [],
				processing: []
			});
			
			add_dir_recursive(path, path);
		}
		
		self.update = function(data) {
			return ds.update(path, data);
		};
		
		self.remove = function() {
			return ds.remove(path);
		};
		
		return self;
	};
	
	Directory.find = ds.find;
	Directory.findOne = ds.findOne;
	Directory.forEach = ds.forEach;
	Directory.remove = function(path) {
		var dir = ds.findOne({"_id": function(v) {return typeof v === 'string' && v.indexOf(path) === 0}});
		if(dir) {
			ds.remove(path);
			return true;
		}
		
		return false;
	}
	
	Util.inherits(Directory, EventEmitter);
	return Directory;
}();

var Archive = function() {
	var ds = new DataStore("playbox.archive");
	ds.on("load", function(d) {
		//(new Directory(d.dir)).update({"$push": {queued: d.path}});
	}).on("add", function(d) {
		emit_event("archive_added", d.meta);
	}).on("remove", function(id) {
		emit_event("archive_removed", id);
	}).on("update", function(d) {
		emit_event("archive_updated", d.meta);
	});
	
	var Archive = function(dir_id, path) {
		path = Path.normalize(path);
		var self = this,
			a = ds.findOne({"path": path}),
			dir = new Directory(dir_id),
			func_remove_path = function(path) {
				return function(d) {
					var o = d.indexOf(path);
					if(o !== -1) d.splice(o, 1);
					return d;
				};
			}(path),
			meta;
		
		self.id = null;
		dir.update({"$push": {processing: path}, "$update": {queued: func_remove_path}});
		
		if(a) {
			// check archive is not modified
			Log.info(a._id+" already in library ("+path+")");
			dir.update({"$push": {archives: path}, "$update": {processing: func_remove_path}});
		} else if((meta = playbox.get_metadata(path)) !== false) {
			strip_metadata(path, function(stripped_archive_path, playbox_hash, st) {
				if(stripped_archive_path) {
					meta.id = playbox_hash;
					//TODO: move make_torrent over to javascript (evented) - to not be blocking anything
					var torrent = playbox.make_torrent(stripped_archive_path);
					var a2 = {
						id: playbox_hash,
						name: meta.name,
						path: path,
						dir: dir_id,
						ctime: st.ctime,
						mtime: st.mtime,
						size: st.size,
					//	torrent: torrent,
						meta: meta
					};
						
					//console.log("begin", a);
					//var b = bencode.encode(a);
					//console.log("end", b.length, b);
					
					//playbox.load_torrent(bencode.encode(torrent));
					
					var lib_file = working_dir+playbox_hash;
					var successful = function() {
						Fs.unlink(stripped_archive_path);
						ds.add(playbox_hash, a2);
						dir.update({"$push": {archives: path}, "$update": {processing: func_remove_path}});
						Log.info("added "+playbox_hash);
					};
					
					Fs.lstat(lib_file, function(err, st) {
						if(err) {
							if(err.code !== 'ENOENT') {
								throw err;
							}
							// fall through
						} else {
							if(st.isSymbolicLink() && Fs.readlinkSync(lib_file) === meta.path) {
								return successful();
							} else {
								Fs.unlinkSync(lib_file);
							}
						}
						
						Fs.symlink(path, lib_file, function(err) {
							if(err && err.code !== 'EEXIST') {
								dir.update({"$push": {archives: path}, "$update": {processing: func_remove_path}});
								throw err;
							}
							
							successful();
						});
					});
				}
			});
		} else {
			// for now, this will make improper results if more than one path is processed at once
			Log.info(path+": not a media file");
			dir.update({"$push": {errors: path}, "$update": {processing: func_remove_path}});
		}
		
		return self;
	};
	
	Archive.find = ds.find;
	Archive.findOne = ds.findOne;
	Archive.forEach = ds.forEach;
	
	//Util.inherits(Archive, EventEmitter);
	return Archive;
}();

function update() {
	var path;
	
	playbox.update();
	
	// this is the new format for things using objects... it's a million times cleaner
	//TODO: control read / write events
	//TODO: put limits.. no fumes discos duros
	//TODO: make this work:
	//var dirs = Directory.find({"queue.length": {"$gt": 0}});
	var dirs = Directory.find();
	for(var i = 0; i < dirs.length; i++) {
		var dir = dirs[i];
		if(dir.queued.length && dir.processing.length < 1) {
			new Archive(dir._id, dir.queued[0]);
			break;
		}
	}
}





/*
playbox.on("stateChanged", function(hash, extra) {
	console.log(hash, "changed state "+extra.prev_state+" -> "+extra.state);
	//archives[hash].status = extra.state;
	status_count[extra.state]++;
	status_count[extra.prev_state]--;
}).on("archiveUnknown", function(hash, e) {
	console.log("UNKNOWN ARCHIVE");
	status_count[archives[hash].status]--;
	//archives[hash] = {status:"UNKNOWN"};
}).on("archivePaused", function(hash, e) {
	//archives[hash].active = false;
	emit_event("archivePaused", archives[hash]);
}).on("archiveResumed", function(hash, e) {
	//archives[hash].active = true;
	emit_event("archiveResumed", archives[hash]);
}).on("archiveLoaded", function(hash, metadata) {
	//if(metadata.local_file) {
	//	get_metadata(metadata.local_file, working_dir + hash, function(tags) {
	//		archives[hash].metadata = Mixin(tags, archives[hash].metadata);
	//		emit_event("archiveLoaded", archives[hash]);
	//	});
	//}
	
	status_count["CHECKING"]++;
	//archives[hash] = {status:"METADATA", downloaded: -1, metadata: metadata};
	emit_event("archiveLoaded", archives[hash]);
}).on("archiveDownloading", function(hash, e) {
	emit_event("archiveDownloading", archives[hash]);
}).on("archiveProgress", function(hash, progress) {
	//archives[hash].downloaded = progress;
	emit_event("archiveProgress", archives[hash]);
}).on("archiveComplete", function(hash, e) {
	//archives[hash].downloaded = 100;
	emit_event("archiveComplete", archives[hash]);
}).on("archiveRemoved", function(hash, e) {
	status_count[archives[hash].status]--;
	//archives[hash].status = "METADATA";
	//archives[hash].downloaded = -1;
	//archives[hash].active = false;
	emit_event("archiveRemoved", archives[hash]);
}).on("metadataAdded", function(hash, path) {
	//load_metadata_queue.push(path);
}).on("listening", function(details) {
	//console.log("LISTENING", details);
}).on("listeningFailed", function(details) {
	console.log("LISTENING_FAILED", details);
});
*/


//TODO: write tests for this function...
// I'm 95% sure that there is a bug somewhere, because the throttle doesn't work.
// it *appears* to generate the correct file, though
// perhaps it'd be best to convert this to a readable stream as well... it's hard to tell...
function strip_metadata(file_path, callback) {
	try {
		var dest_path = tmp_dir+"strip."+(tmp_file_id++)+".mp3";
		var sha1 = Crypto.createHmac("sha1", "human-evolution");

		Fs.open(file_path, 'r', function(err, fd_r) {
			if(err) throw err;
			
			Fs.fstat(fd_r, function(err, path_stat) {
				if(err) {
					//TODO  something here with closing the fd - I just don't remember what :)
					//Fs.close(fd_r);
					throw err;
				}
				
				var total = path_stat.size;
				Fs.open(dest_path, 'w+', '644', function(err, fd_w) {
					if(err) {
						Fs.close(fd_r);
						throw err;
					}
					
					//var rstream = Fs.createReadStream(file_path, {fd: fd_r, bufferSize: 64 * 1024});
					var wstream = Fs.createWriteStream(dest_path, {fd: fd_w});
					
					/*
					rstream.on('data', function(inbuf) {
						rstream.pause();
						wstream.write(inbuf);
					}).on('end', function() {
						wstream.end();
					});
					*/
					
					wstream.on('drain', function() {
						//console.log('drain');
					}).on('error', function(err) {
						console.log("ERROR", err.stack);
					});
					
					
					var interval = setInterval(function() {
						var chunk_size = 64 * 1024;
						var buf_size   = 1024 * 1024;
						var min_id3    = 512 * 1024; // half mega should be good for reading the id3 tag and enough buffer not to kill the hard disk if I write slowly 
						var buf        = new Buffer(buf_size);
						
						var tail = 0;
						var head = 0;
						var total_read = 0;
						var total_written = false;
						var skipped = 0;
						
						var do_read = function() {
							var offset = head >= tail ? head : 0;
							var avail = Math.min(chunk_size, head >= tail ? buf_size - head : tail);
							Fs.read(fd_r, buf, offset, avail, total_read, function(err, bytes) {
								if(err) throw err;
								
								//console.log('r', bytes, '||', head, tail, head - tail);
								total_read += bytes;
								head += bytes;
								head %= buf_size;
							});
						};
						
						var do_write = function() {
							if(wstream.writable && head !== tail) {
								var offset = tail;
								var avail = Math.min(chunk_size, head >= tail ? head - tail : buf_size - tail);
								var writebuf = buf.slice(offset, offset + avail);
								wstream.write(writebuf);
								sha1.update(writebuf);
								
								//console.log('w', bytes, '||', head, tail, head - tail);
								total_written += avail;
								tail += avail;
								tail %= buf_size;
							}
						};
						
						// 10 times a second, we'll worry about reading / writing
						var start = new Date().getTime();
						return function() {
							if(total_written + skipped === total) {
								clearInterval(interval);
								Fs.close(fd_r);
								wstream.end();
								
								if(callback) {
									callback(dest_path, sha1.digest("hex"), path_stat);
								}
							}
							
							var time_d = new Date().getTime() - start;
							if(total_read < total && total_read / time_d < (config.read_kb_speed * 1000)) {
								do_read();
							}
							
							if(total_written === false) {
								if(total_read >= min_id3) {
									total_written = 0;
									var id3 = new ID3File(buf);
									if(id3.parse()) {
										var t = id3.getTags();
										
										if(t.id3 && t.id3.size) {
											var b = new Buffer("ID3\x02\0\0\0\0\0");
											Fs.write(fd_w, b, 0, b.length, 0);
											sha1.update(b);
											tail = skipped = t.id3.size;
										}
									}
								}
							} else if(total_read > total_written && (total_written / time_d) < (config.write_kb_speed * 1000)) {
								do_write();
							}
						};	
					}(), 100);
				});
			});
		});
	} catch(e) {
		if(callback) {
			callback(false, false);
		}
		
		throw e;
	}
}


exports.start = function() {
	if(update_loop === null) {
		update_loop = setInterval(update, 100);
	}
	
	return playbox.start();
};

exports.stop = function() {
	if(update_loop !== null) {
		clearInterval(update_loop);
		update_loop = null;
	}
	
	return playbox.stop();
};


exports.connect = function(c) {
	console.log("websocket connect");
};

exports.disconnect = function(c) {
	console.log("websocket disconnect");
};

exports.http = function(c, path) {
	var path_offset = path.indexOf('/'),
		func = path_offset > 0 ? path.substr(0, path_offset) : path,
		extra = path_offset > 0 ? path.substr(path_offset+1) : "",
		output = {
			path: path,
			status: 200,
			ret: null
		};
		
	switch(func) {
		case 'g':
			c.file("audio/mpeg", working_dir+"/"+extra);
			return;
			
		case 'q':
			output.ret = query(args);
			break;
		
		/*
		case '?':
			output.ret = {
				online: update_loop !== null ? true : false,
				archives: status_count
			};
			break;
			
		case 'i':
			var t = archives[path];
			if(!t) {
				t = archives[path] = {status:"LOOKUP"};
				//load_metadata_queue.push(path);
				//playbox.add_archive_metadata(path);
			}
			
			output.ret = t;
			//output.ret = playbox.archive(path);
			break;
		*/
			
		case '/':
			//c.file("application/xhtml+xml", "./apps/playbox/public/index.html");
			c.file("text/html; charset=utf-8", "./apps/playbox/public/playbox.html");
			return;
			
		default:
			var mime = ext2mime(Path.extname(path)) | "text/plain";
			c.file(mime, "./apps/playbox/public/"+path);
			return;
	}
	
	c._headers["Content-Type"] = _ext2mime["js"] + '; charset=utf-8';
	c.print(JSON.stringify(output));
	c.end(output.status);
};

exports.cmds = {
	query: function(params, callback) {
		if(typeof params !== 'object') {
			params = {};
		}
		
		var name = params.name ? params.name.toLowerCase() : false;
		var archives = Archive.forEach(name === false ?
				function(d) {
					return d.meta;
				} :
				function(d) {
					if(d.name.toLowerCase().indexOf(name) !== -1 || d.path.toLowerCase().indexOf(name) !== -1) {
						return d.meta;
					}
				}, params.offset, params.limit);
		
		callback(archives);
	},
	get_dirs: function(params, callback) {
		var d = Directory.find();
		callback(d);
	},
	add_dir: function(params, callback) {
		var path = params._id;
		if(!path) {
			throw new Error("'_id' ('path') not defined");
		}
		
		Fs.stat(path, function(err, st) {
			if(st.isDirectory()) {
				(new Directory(path));
			} else if(st.isFile()) {
				(new Directory(Path.dirname(path)));
			} else {
				callback({"$error": "not a directory"});
			}
		});
	},
	rm_dir: function(params, callback) {
		var id = params._id;
		if(!id) {
			throw new Error("'_id' not defined");
		}
		
		Directory.remove(id);
	},
	list_dir: function(params, callback, error) {
		var root = Path.normalize(params && params.root || "/"),
			dirs = [];
		
		Fs.readdir(root, function(err, files) {
			if(err) return error(err);
			
			if(root.substr(-1) !== "/") {
				root += "/";
			}
			
			//TODO: need a generic function to list directories and not smoke the disk...
			// it should have have an optional variable to define how many files it should stat at once
			// porque si no, fumas todo el disco en una carpeta que tenga mil carpetas dentro... jaja
			// hotfix... fs.statSync :)
			
			var i = files.length-1;
			if(files.length) {
				for(var i = 0, len = files.length; i < len; i++) {
					//files = files.sort();
					var file = files[i];
					var st = Fs.statSync(root+"/"+file);
					if(st && st.isDirectory() && file.charAt(0) !== '.') {
						dirs.push({dir: file});
					}
				}
				
				callback(dirs, {root: root});					
			}
		});
	}
};


Log.info("playbox-v0.2");
Log.info(" - library_dir: "+working_dir);
Log.info(" - tmp_dir: "+tmp_dir);

//TODO: move this over to DataStore
Edb.get("config", function(key, value) {
	if(typeof value === 'undefined') {
		// running the playbox for the very first time
		// do more first time stuff, like loading the local library
		Edb.set("config", config, function() {
			new Directory(working_dir.substr(0, working_dir.indexOf("/Library"))+"/Music");
		});
	} else {
		Mixin(config, value);
	}
});

// start the updates
update_loop = setInterval(update, 100);

