
var sys = require("sys"),
	fs = require('fs'),
	path = require('path'),
	buffer = require('buffer'),
	ID3File = require("node-id3"),
	Mixin = require("node-websocket-server/lang/mixin"),
	Edb = require("edb"),
	crypto = require("crypto");

var playbox = new Playbox(),
	add_archive_queue = [],
	add_archive_metadata_queue = [],
	update_loop = null,
	torrents = {},
	last_activity = 0,
	status_count = {
		"PARSING": 0,
		"METADATA": 0,
		"DOWNLOADING_METADATA": 0,
		"CHECKING": 0,
		"DOWNLOADING": 0,
		"OK": 0
	};

var do_update = function() {
	var path;
	playbox.update();
	
	//broadcast_event("update", {truth: true});
	//TODO: put limits.. no fumes discos duros
	if(!status_count["CHECKING"]) {
		if(add_archive_metadata_queue.length && status_count["CHECKING"] < 2) {
			path = add_archive_metadata_queue.shift();
			playbox.add_archive_metadata(path);
		} else if(add_archive_queue.length) {
			path = add_archive_queue.shift();
			var c = 0;
			for(var i in torrents) {
				c++;
				var t = torrents[i];
				if(t.local_file === path) {
					path = null;
				}
			}
			
			if(status_count["PARSING"] < 2 && path) {
				var meta = playbox.get_archive_metadata(path);
				
				if(meta !== false) {
					status_count["PARSING"]++;
					strip_metadata(path, function(stripped_archive_path, playbox_hash) {
						status_count["PARSING"]--;
						var torrent = meta.torrent = playbox.make_archive_torrent(stripped_archive_path);
						// instead of returning just the hash, return the whole torrent in js format
						// write a loading of e
						//meta.hash = hash;
						meta.id = torrent.comment = playbox_hash;
						meta.path = path;
						meta.torrent = torrent;
						//console.log(sys.inspect(meta));
						
						//TODO!!
						//playbox.load_torrent(torrent);
						
						// after it's finished, it'll call the event "metadataAdded"
						// the event will contain local_file path + torrent path
						Edb.set("archive."+playbox_hash, meta, function() {
							console.log("saved...");
							// CURRENT - send an event up saying there's a new archive
						});
						
						fs.unlink(stripped_archive_path);
					});
				}
			}
		}
	} else {
		last_activity = new Date();
	}
};

function broadcast_event(evt, data) {
	data = data || {};
	
	server.broadcast(JSON.stringify({
		app: "playbox",
		func: "event",
		args: evt,
		data: data
	}));
}

/*
add_archive
------
get metadata with ffmpeg
if(is a mp3) {
	copy to the library without the metadata
	make the torrent hashes from the library file
	save the torrent file
	save the metadata into edb
}
*/


playbox.on("stateChanged", function(hash, extra) {
	console.log(hash, "changed state "+extra.prev_state+" -> "+extra.state);
	torrents[hash].status = extra.state;
	status_count[extra.state]++;
	status_count[extra.prev_state]--;
}).on("archiveUnknown", function(hash, e) {
	console.log("UNKNOWN ARCHIVE");
	status_count[torrents[hash].status]--;
	torrents[hash] = {status:"UNKNOWN"};
}).on("archivePaused", function(hash, e) {
	torrents[hash].active = false;
	broadcast_event("archivePaused", torrents[hash]);
}).on("archiveResumed", function(hash, e) {
	torrents[hash].active = true;
	broadcast_event("archiveResumed", torrents[hash]);
}).on("archiveMetadata", function(hash, metadata) {
	/*if(metadata.local_file) {
		get_metadata(metadata.local_file, playbox.library_dir + hash, function(tags) {
			torrents[hash].metadata = Mixin(tags, torrents[hash].metadata);
			broadcast_event("archiveMetadata", torrents[hash]);
		});
	}
	*/
	
	status_count["CHECKING"]++;
	torrents[hash] = {status:"METADATA", downloaded: -1, metadata: metadata};
	broadcast_event("archiveMetadata", torrents[hash]);
}).on("archiveDownloading", function(hash, e) {
	broadcast_event("archiveDownloading", torrents[hash]);
}).on("archiveProgress", function(hash, progress) {
	torrents[hash].downloaded = progress;
	broadcast_event("archiveProgress", torrents[hash]);
}).on("archiveComplete", function(hash, e) {
	torrents[hash].downloaded = 100;
	broadcast_event("archiveComplete", torrents[hash]);
}).on("archiveRemoved", function(hash, e) {
	status_count[torrents[hash].status]--;
	torrents[hash].status = "METADATA";
	torrents[hash].downloaded = -1;
	torrents[hash].active = false;
	broadcast_event("archiveRemoved", torrents[hash]);
}).on("metadataAdded", function(hash, path) {
	add_archive_metadata_queue.push(path);
}).on("listening", function(details) {
	console.log("LISTENING", details);
}).on("listeningFailed", function(details) {
	console.log("LISTENING_FAILED", details);
});

function start() {
	if(update_loop === null) {
		update_loop = setInterval(do_update, 100);
	}
	
	return playbox.start();
}

function stop() {
	if(update_loop !== null) {
		clearInterval(update_loop);
		update_loop = null;
	}
	
	return playbox.stop();
}

function init() {
	console.log("Initializing playbox-2");
	console.log(" library_dir: "+playbox.library_dir);
	console.log(" torrents_dir: "+playbox.torrents_dir);
	
	// dir scan of the torrents
	/*
	fs.readdir(playbox.torrents_dir, function(err, files) {
		if(err) throw err;
		var i = files.length-1;
		if(i >= 0) {
			do {
				hash = files[i].toString();
				//if(add_archive_metadata_queue.length < 11) {
					add_archive_metadata_queue.push(playbox.torrents_dir+hash);
				//}
			} while(i--);
		}
	});
	*/
	
	var music_dir = playbox.library_dir.substr(0, playbox.library_dir.indexOf("/Library"))+"/Music";
	add_media(music_dir);
	fs.stat(music_dir), function(err, st) {
		if(st.isFile()) {
			add_archive_queue.push(music_dir);
		} else {
			fs.readdir(playbox.torrents_dir, function(err, files) {
				if(err) throw err;
				var i = files.length-1;
				if(i >= 0) {
					do {
						hash = files[i].toString();
						add_archive_metadata_queue.push(playbox.torrents_dir+hash);
					} while(i--);
				}
			});
		}
	}
	
	Edb.init(playbox.library_dir + ".edb", function() {
		console.log("Edb initialized");
		Edb.list("archive.", function(key, value) {
			console.log(sys.inspect(key), sys.inspect(value));
			// CURRENT - save this metadata into memory for queries
			//playbox.crash();
		});
	});
	
	// start the updates
	update_loop = setInterval(do_update, 100);
}

function add_media(p) {
	fs.stat(p, function(err, st) {
		if(err) throw err;
		if(st.isFile() && path.extname(p) === ".mp3" && st.size < 8 * 1024 * 1024) {
			add_archive_queue.push(p);
		} else if(st.isDirectory()) {
			fs.readdir(p, function(err, files) {
				if(err) throw err;
				var i = files.length-1;
				if(i >= 0) {
					do {
						add_media(p+"/"+files[i].toString());
					} while(i--);
				}
			});
		}
	})
}

function query(args) {
	var ret = args ? {} : torrents;
	console.log("args", args);
	if(args) {
		var argslower = args.toLowerCase()
		for(var i in torrents) {
			var t = torrents[i];
			if(t.metadata && (
				t.metadata.name.toLowerCase().indexOf(argslower) !== -1 ||
				t.metadata.local_file.toLowerCase().indexOf(argslower) !== -1
				)) {
				ret[i] = t;
			}
		}
	}
	
	return ret;
}

var tmp_offset = 0;
function strip_metadata(file_path, callback) {
	//TODO: circular buffer, and obeying speed limits
	console.log("strip_metadata", file_path)
	fs.stat(file_path, function(err, st) {
		if(err) throw err;
		var chunk_size = 64 * 1024;
		var buf_size   = 512 * 1024; // half mega should be good for reading the id3 tag and enough buffer not to kill the hard disk if I write slowly
		var buf_pos    = 0;
		var buf = new Buffer(buf_size);
		var dest_path = playbox.tmp_path+"strip."+(tmp_offset++);
		
		var orig_size = st.size;
		var remaining = orig_size;
		var offset = 0;
		var got_meta = false;
		var sha1 = crypto.createHmac("sha1", "changeme");
		var sr = fs.createReadStream(file_path, {flags: 'r', encoding: 'binary', mode: 0666, bufferSize: chunk_size}),
			sw = fs.createWriteStream(dest_path+".mp3", {flags: 'w+', mode: 0644});
		
		var write_func = function() {
			buf_pos = 0;
			if(remaining < buf.length) {
				if(remaining > 0) {
					var b = buf.slice(offset, remaining);
					sw.write(b);
					sha1.update(b);
				}
				
				remaining = -1;
			} else {
				remaining -= buf.length;
				if(offset === 0) {
					sw.write(buf);
					sha1.update(buf);
				} else {
					var b = buf.slice(offset);
					sw.write(b);
					sha1.update(b);
					offset = 0;
				}
			}
		}
		
		var get_meta = function() {
			//TODO: do a test to see if the buffer has an ID3 tag at the beginning.
			// if it doesn't, add it (so that ffmpeg will try and determine the duration)
			var id3 = new ID3File(buf);
			if(id3.parse()) {
				var t = id3.getTags();
				got_meta = true;
				
				if(t.id3 && t.id3.size) {
					offset = t.id3.size;
					sw.write("ID3\x02\0\0\0\0\0");
					sha1.update("ID3\x02\0\0\0\0\0");
				}
			}
		}
		
		sw.on('drain', function() {
			if(remaining === -1) {
				sw.end();
			} else {
				sr.resume();
			}
		}).on('close', function() {
			callback(dest_path+".mp3", sha1.digest(encoding="hex"));
		});
		
		sr.on("data", function(chunk) {
			// TODO: when reading this in, the whole file should be read, and then just simply call the function, "setPieceHashes"
			// or whatever it's called... to also control the speed the file is read (preventing blocking)
			var bufNextPos = buf_pos + chunk.length;
			buf.write(chunk,'binary',buf_pos);
			if(bufNextPos >= buf_size) {
				if(remaining > 0) {
					sr.pause();
				}
				
				if(got_meta === false) {
					// right now, there's a huge bug, if the metadata is larger than the buffer, so for now... I'm just skipping it
					// I will need to continually increase the size of the buffer, until I am able to retrieve the metadata.
					get_meta();
					got_meta = true;
				}
				
				buf_pos = 0;
				write_func();
			} else if(buf_pos < buf_size) {
				buf_pos = bufNextPos;
			} else {
				// now, write
				//console.log("still going", chunk.length);
			}
		}).on("end", function(chunk) {
			buf_pos = 0;
			write_func();
		}).addListener("close", function() {
			// something of closing here
		});
	});
}

var _ext2mime = {
	"html": "text/html",
	"ico": "image/x-icon",
	"gif": "image/gif",
	"jpg": "image/jpeg",
	"jpg": "image/jpeg",
	"js": "text/javascript",
	"json": "application/x-json",
	"xml": "text/xml",
};
function ext2mime(ext) {
	if(ext.charAt(0) === '.') {
		ext = ext.substr(1);
	}
	
	return _ext2mime[ext];
}

exports.http = function(c, func, args) {
	var output = {
		func: func,
		args: args,
		status: 200,
		ret: null
	};
	
	switch(func) {
		case '?':
			output.ret = {
				online: update_loop !== null ? true : false,
				archives: status_count
			};
			break;
		
		case '-':
			output.ret = start();
			break;
			
		case 'o':
			output.ret = stop();
			break;
			
		case 'q':
			output.ret = query(args);
			break;
			
		case 'g':
			c.file("audio/mp3", playbox.library_dir+"/"+args);
			return;
			
		case 'i':
			var t = torrents[args];
			if(!t) {
				t = torrents[args] = {status:"LOOKUP"};
				//add_archive_metadata_queue.push(args);
				//playbox.add_archive_metadata(args);
			}
			
			output.ret = t;
			//output.ret = playbox.archive(args);
			break;
			
		case '/':
			//c.file("application/xhtml+xml", "./apps/playbox/public/index.html");
			c.file("text/html; charset=utf-8", "./apps/playbox/public/index.html");
			return;
			
		default:
			var mime = ext2mime(path.extname(args)) | "text/plain";
			c.file(mime, "./public/"+args);
			return;
	}
	
	c._headers["Content-Type"] = _ext2mime["js"] + '; charset=utf-8';
	c.print(JSON.stringify(output));
	c.end(output.status);
};

var websocket_broadcast = function(msg) {
	console.log("application not initialized with websockets enabled");
};

exports.init = function(opts) {
	if(opts.ws_broadcast) {
		websocket_broadcast = opts.ws_broadcast;
	}
}

exports.websocket_connect = function(c) {
	console.log("websocket connect");
}

exports.websocket_disconnect = function(c) {
	console.log("websocket disconnect");
}

exports.websocket_func = function(c, func, args) {
	//console.log("ws", c._conn.broadcast);
}

function broadcast_event(evt, data) {
	data = data || {};
	
	websocket_broadcast(JSON.stringify({
		app: "playbox",
		func: "event",
		args: evt,
		data: data
	}));
}

// start it up!
console.log("init:", init());

// debug shit
console.log("starting:", start());


