var Sys = require("sys"),
	Fs = require('fs'),
	$fs = require('$fs'),
	Path = require('path'),
	ID3File = require("node-id3"),
	Crypto = require("crypto");

var playbox = new Playbox(),
	add_archive_queue = [],
	load_metadata_queue = [],
	update_loop = null,
	archives = {},
	last_idle = 0,
	status_count = {
		"PARSING": 0,
		"METADATA": 0,
		"DOWNLOADING_METADATA": 0,
		"CHECKING": 0,
		"DOWNLOADING": 0,
		"OK": 0
	},
	config = {
		// config default values
		read_kb_speed: 5000,
		write_kb_speed: 3000
	};
	
function update() {
	var path;
	
	playbox.update();
	
	//TODO: control read / write events
	//TODO: put limits.. no fumes discos duros
	if(!status_count["CHECKING"]) {
		if(load_metadata_queue.length && status_count["CHECKING"] < 2) {
			path = load_metadata_queue.shift();
			playbox.add_archive_metadata(path);
		} else if(add_archive_queue.length && load_metadata_queue.length === 0) {
			var c = 0,
				i, t, meta;
			
			for(i in archives) {
				c++;
			}
			
			//console.log(c, status_count["PARSING"]);
			if(c < 11 && status_count["PARSING"] < 1 && (path = add_archive_queue.shift())) { // && path.indexOf('04. The American Way') !== -1
				c = true;
				for(i in archives) {
					t = archives[i];
					if(t.path === path) {
						// already loaded
						c = false;
						break;
					}
				}
				
				if(c && (meta = playbox.get_archive_metadata(path)) !== false) {
					status_count["PARSING"]++;
					strip_metadata(path, function(stripped_archive_path, playbox_hash) {
						status_count["PARSING"]--;
						var torrent = playbox.make_archive_torrent(stripped_archive_path);
						meta.id = torrent.comment = playbox_hash;
						var a = {
							id: playbox_hash,
							name: meta.name,
							path: path,
							torrent: torrent,
							meta: meta
						}
						
						//TODO!!
						//playbox.load_torrent(torrent);
						
						update_metadata(playbox_hash, a);
						
						$fs.unlink(stripped_archive_path);
					});
				}
			}
		}
	} else {
		last_idle = new Date();
	}
}

function broadcast_event(evt, data) {
	data = data || {};
	
	server.broadcast(JSON.stringify({
		app: "playbox",
		func: "event",
		args: evt,
		data: data
	}));
}


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
	broadcast_event("archivePaused", archives[hash]);
}).on("archiveResumed", function(hash, e) {
	//archives[hash].active = true;
	broadcast_event("archiveResumed", archives[hash]);
}).on("archiveLoaded", function(hash, metadata) {
	/*if(metadata.local_file) {
		get_metadata(metadata.local_file, playbox.library_dir + hash, function(tags) {
			archives[hash].metadata = Mixin(tags, archives[hash].metadata);
			broadcast_event("archiveLoaded", archives[hash]);
		});
	}
	*/
	
	status_count["CHECKING"]++;
	//archives[hash] = {status:"METADATA", downloaded: -1, metadata: metadata};
	broadcast_event("archiveLoaded", archives[hash]);
}).on("archiveDownloading", function(hash, e) {
	broadcast_event("archiveDownloading", archives[hash]);
}).on("archiveProgress", function(hash, progress) {
	//archives[hash].downloaded = progress;
	broadcast_event("archiveProgress", archives[hash]);
}).on("archiveComplete", function(hash, e) {
	//archives[hash].downloaded = 100;
	broadcast_event("archiveComplete", archives[hash]);
}).on("archiveRemoved", function(hash, e) {
	status_count[archives[hash].status]--;
	//archives[hash].status = "METADATA";
	//archives[hash].downloaded = -1;
	//archives[hash].active = false;
	broadcast_event("archiveRemoved", archives[hash]);
}).on("metadataAdded", function(hash, path) {
	load_metadata_queue.push(path);
}).on("listening", function(details) {
	//console.log("LISTENING", details);
}).on("listeningFailed", function(details) {
	console.log("LISTENING_FAILED", details);
});

function start() {
	if(update_loop === null) {
		update_loop = setInterval(update, 100);
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
	Log.info("playbox-2");
	Log.info(" library_dir: "+playbox.library_dir);
	Log.info(" torrents_dir: "+playbox.torrents_dir);
	
	Edb.get("config", function(key, value) {
		if(typeof value === 'undefined') {
			// running the playbox for the very first time
			// do more first time stuff, like loading the local library
			Edb.set("config", config);
		} else {
			Mixin(config, value);
		}
		
		add_media(playbox.library_dir.substr(0, playbox.library_dir.indexOf("/Library"))+"/Music");
	});
	
	Edb.list("archive.", function(key, value) {
		if(value !== undefined) {
			update_metadata(value.id, value);
		}
	});
	
	// start the updates
	update_loop = setInterval(update, 100);
}

function update_metadata(hash, meta) {
	if(typeof archives[hash] !== 'undefined') {
		Log.info("updated "+hash);
		archives[hash] = meta = Mixin(archives[hash], meta);
		broadcast_event("archiveUpdated", meta);
	} else {
		Log.info("addded "+hash);
		var lib_file = playbox.library_dir+hash;
		
		try {
			var st = $fs.lstat(lib_file);
			if(!st.isSymbolicLink()) {
				$fs.unlink(lib_file);
			}
		} catch(e) {
			// file doesn't exist (expected behaviour)
		} finally {
			try {
				st = $fs.lstat(lib_file);
				if(!st.isSymbolicLink()) {
					throw new Error("unable to make library symlink");
				}
			} catch(e) {
				$fs.symlink(meta.path, playbox.library_dir+hash);
			}
		}
		
		archives[hash] = meta;
		broadcast_event("archiveAdded", meta);
	}
	
	Edb.set("archive."+hash, meta, function() {
		//console.log("saved..");
	});
}

function add_media(p) {
	using(var st = $fs.stat(p)) {
		if(st.isFile() && Path.extname(p) === ".mp3" && st.size < 8 * 1024 * 1024) {
			add_archive_queue.push(p);
		} else if(st.isDirectory()) {
			using(var files = $fs.readdir(p)) {
				var i = files.length-1;
				if(i >= 0) {
					do {
						add_media(p+"/"+files[i].toString());
					} while(i--);
				}
			}
		}
	}
}

function query(args) {
	if(!args) args = '';
	var ret = {},
		argslower = args.toLowerCase();
	
	for(var i in archives) {
		var a = archives[i];
		if(!args || (
			a.name.toLowerCase().indexOf(argslower) !== -1 ||
			a.path.toLowerCase().indexOf(argslower) !== -1
			)) {
			
			ret[i] = a.meta;
		}
	}
	
	return ret;
}


var tmp_offset = 0;
function strip_metadata(file_path, callback) {
	//try {
		var st = $fs.stat(file_path);
		var  chunk_size = 64 * 1024;
		var  buf_size   = 512 * 1024; // half mega should be good for reading the id3 tag and enough buffer not to kill the hard disk if I write slowly
		var buf_pos    = 0;
		var buf = new Buffer(buf_size);
		var dest_path = playbox.tmp_path+"strip."+(tmp_offset++);
		var sha1 = Crypto.createHmac("sha1", "changeme");

		using(var sr = $fs.openInStream(file_path)) {
			using(var sw = $fs.openOutStream(dest_path+".mp3", 'w+', 0644)) {
				var bytes = sr.readBuf(buf, 64*1024);
				
				// extract metadata
				//TODO: do a test to see if the buffer has an ID3 tag at the beginning.
				// if it doesn't, add it (so that ffmpeg will try and determine the duration)
				var id3 = new ID3File(buf);
				if(id3.parse()) {
					var t = id3.getTags();
					got_meta = true;
					
					if(t.id3 && t.id3.size) {
						sw.writeUtf8("ID3\x02\0\0\0\0\0");
						sha1.update("ID3\x02\0\0\0\0\0");
						
						var b = buf.slice(t.id3.size);
						sha1.update(b);
						sw.writeBuf(b);
					}
				}
				
				while(bytes = sr.readBuf(buf)) {
					sw.writeBuf(buf, 0, bytes);
					sha1.update(bytes === buf.length ? buf : buf.slice(0, bytes));
				}
			}
		}
		
		if(callback) {
			callback(dest_path+".mp3", sha1.digest(encoding="hex"));
		}
	/*} catch(e) {
		switch(e.code) {
			case 'ENOENT':
				console.log(" [ERROR] file could not be found");
				break;
				
			default:
				console.log("bailing..", Sys.inspect(e));
		}
	}*/
}

// TODO: move this to a lib function
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

exports.http = function(c, path) {
	var path_offset = path.indexOf('/'),
		func = path_offset === -1 ? path : path.substr(0, path_offset),
		args = path_offset === -1 ? "" : path.substr(path_offset+1),
		output = {
			path: path,
			status: 200,
			ret: null
		};
		
	console.log("func", func, "args", args);
	
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
			
		case 'g':
			console.log("get", playbox.library_dir+"/"+args);
			c.file("audio/mp3", playbox.library_dir+"/"+args);
			return;
			
		case 'q':
			output.ret = query(args);
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
			
		case '/':
			//c.file("application/xhtml+xml", "./apps/playbox/public/index.html");
			c.file("text/html; charset=utf-8", "./apps/playbox/public/index.html");
			return;
			
		default:
			var mime = ext2mime(Path.extname(path)) | "text/plain";
			c.file(mime, "./public/"+path);
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

exports.websocket_func = function(c, func, path) {
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
init();

// debug shit
start();
