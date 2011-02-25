//"use strict";
var Sys = require("sys"),
	Fs = require('fs'),
	Path = require('path'),
	Crypto = require("crypto"),
	ID3File = require("lib/node-id3"),
	bencode = require("lib/bencode");

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



var broadcast = function(msg) {
	console.log("application not initialized with websockets enabled");
};

function add_dir(p) {
	var num = 0;

	Fs.stat(p, function(err, st) {
		if(err) throw err;
		
		if(st.isFile() && Path.extname(p) === ".mp3" && st.size < 8 * 1024 * 1024) {
			add_archive_queue.push(p);
			num++;
		} else if(st.isDirectory()) {
			
			Fs.readdir(p, function(err, files) {
				if(err) throw err;
				
				var i = files.length-1;
				if(i >= 0) {
					do {
						add_dir(p+"/"+files[i].toString());
					} while(i--);
				}
			});
		}
	});
	
	return num;
}


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
			
			if(c < 11 && status_count["PARSING"] < 1 && (path = add_archive_queue.shift())) { // && path.indexOf('04. The American Way') !== -1
				c = true;
				for(i in archives) {
					t = archives[i];
					if(t.path === path) {
						// already loaded
						Log.info(t.id+" already in library");
						c = false;
						break;
					}
				}
				
				if(c && (meta = playbox.get_metadata(path)) !== false) {
					status_count["PARSING"]++;
					strip_metadata(path, function(stripped_archive_path, playbox_hash, st) {
						status_count["PARSING"]--;
						
						if(stripped_archive_path) {
							var torrent = playbox.make_torrent(stripped_archive_path);
							//if(torrent) {
								meta.id = playbox_hash;
								var a = {
									id: playbox_hash,
									name: meta.name,
									path: path,
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
								update_metadata(playbox_hash, a);
							//}
							
							Fs.unlink(stripped_archive_path);
						}
					});
				}
			}
		}
	} else {
		last_idle = new Date();
	}
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
	emit_event("archivePaused", archives[hash]);
}).on("archiveResumed", function(hash, e) {
	//archives[hash].active = true;
	emit_event("archiveResumed", archives[hash]);
}).on("archiveLoaded", function(hash, metadata) {
	/*if(metadata.local_file) {
		get_metadata(metadata.local_file, playbox.library_dir + hash, function(tags) {
			archives[hash].metadata = Mixin(tags, archives[hash].metadata);
			emit_event("archiveLoaded", archives[hash]);
		});
	}
	*/
	
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



function update_metadata(hash, meta) {
	if(typeof archives[hash] !== 'undefined') {
		Log.info("updated "+hash);
		archives[hash] = meta = Mixin(archives[hash], meta);
		emit_event("archiveUpdated", meta);
	} else {
		Log.info("addded "+hash);
		var lib_file = playbox.library_dir+hash;
		
		try {
			Fs.lstat(lib_file, function(err, st) {
				if(err) {
					if(err.code !== 'ENOENT') {
						throw err;
					}
					// fall through
				} else {
					if(st.isSymbolicLink() && Fs.readlinkSync(lib_file) === meta.path) {
						Fs.unlinkSync(lib_file);
					}
				}
				
				Fs.symlink(meta.path, playbox.library_dir+hash, function(err) {
					if(err && err.code !== 'EEXIST') {
						throw err;
					}
					
					archives[hash] = meta;
					emit_event("archiveAdded", meta);
				});
			});
		} catch(e) {
			throw e;
		}
	}
	
	Edb.set("archive."+hash, meta);
}

exports.cmds = {
	query: function(args) {
		if(!args) args = {};
		
		var ret = [],
			name = args.name ? args.name.toLowerCase() : false,
			offset = args.offset || 0,
			limit = args.limit || 100,
			noargs = !name ? true : false,
			i = 0,
			count = 0;
		
		for(var hash in archives) {
			var a = archives[hash];
			
			if(count < limit &&
			(
				noargs || 
				name && (
					a.name.toLowerCase().indexOf(name) !== -1 ||
					a.path.toLowerCase().indexOf(name) !== -1
				)
			) && i++ >= offset) {
				ret.push(a.meta);
				count++;
			}
		}
		
		return ret;
	}
};


var tmp_offset = 0;
function strip_metadata(file_path, callback) {
	try {
		var dest_path = playbox.tmp_path+"strip."+(tmp_offset++);
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
				
				Fs.open(dest_path+".mp3", 'w+', '644', function(err, fd_w) {
					if(err) {
						Fs.close(fd_r);
						throw err;
					}
					
					var interval = setInterval(function() {
						var chunk_size = 64 * 1024;
						var buf_size   = 1024 * 1024;
						var min_id3    = 512 * 1024; // half mega should be good for reading the id3 tag and enough buffer not to kill the hard disk if I write slowly
						var buf = new Buffer(buf_size);
						
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
							if(head !== tail) {
								var offset = tail;
								var avail = Math.min(chunk_size, head >= tail ? head - tail : buf_size - tail);
								Fs.write(fd_w, buf, offset, avail, total_written, function(err, bytes) {
									if(err) throw err;
									
									//console.log('w', bytes, '||', head, tail, head - tail);
									sha1.update(buf.slice(offset, offset + avail));
									total_written += bytes;
									tail += bytes;
									tail %= buf_size;
								});
							}
						};
						
						// 10 times a second, we'll worry about reading / writing
						var start = new Date().getTime();
						return function() {
							if(total_written + skipped === total) {
								clearInterval(interval);
								Fs.close(fd_r);
								Fs.close(fd_w);
								
								if(callback) {
									callback(dest_path+".mp3", sha1.digest(encoding="hex"), path_stat);
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

// TODO: move this to a lib function
function ext2mime(ext) {
	var _ext2mime = {
		"html": "text/html",
		"ico": "image/x-icon",
		"gif": "image/gif",
		"jpg": "image/jpeg",
		"js": "text/javascript",
		"json": "application/x-json",
		"xml": "text/xml"
	};
	if(ext.charAt(0) === '.') {
		ext = ext.substr(1);
	}
	
	return _ext2mime[ext];
}

exports.init = function(opts) {
	if(opts.broadcast) {
		broadcast = opts.broadcast;
	}
	
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
		
		add_dir(playbox.library_dir.substr(0, playbox.library_dir.indexOf("/Library"))+"/Music");
	});
	
	Edb.list("archive.", function(key, value) {
		if(value !== undefined) {
			update_metadata(value.id, value);
		}
	});
	
	// start the updates
	update_loop = setInterval(update, 100);
};


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
		case '?':
			output.ret = {
				online: update_loop !== null ? true : false,
				archives: status_count
			};
			break;
		
		case 'g':
			c.file("audio/mp3", playbox.library_dir+"/"+extra);
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


function emit_event(evt, data) {
	data = data || {};
	
	broadcast({
		app: "playbox",
		func: "event",
		args: evt,
		data: data
	});
}
