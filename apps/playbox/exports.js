
var sys = require("sys"),
	fs = require('fs'),
	path = require('path'),
	buffer = require('buffer'),
	ID3File = require("node-id3"),
	Mixin = require("node-websocket-server/lang/mixin");

console.log(Mixin);

var playbox = new Playbox(),
	add_archive_queue = [],
	add_archive_metadata_queue = [],
	update_loop = null,
	torrents = {},
	last_activity = 0,
	status_count = {
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
			//console.log("add_archive_metadata", path);
			playbox.add_archive_metadata(path);
		} else if(add_archive_queue.length) {
			path = add_archive_queue.shift();
			var c = 0;
			for(var i in torrents) {
				c++;
				var t = torrents[i];
				//console.log("1:"+t.local_file+"\n2:"+path);
				if(t.local_file === path) {
					path = null;
				}
			}
			
			if(c < 2 && path) {
				//console.log("add_archive", path);
				//playbox.add_archive(path);
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
	if(metadata.local_file) {
		get_metadata(metadata.local_file, function(tags) {
			torrents[hash].metadata = Mixin(tags, torrents[hash].metadata);
			broadcast_event("archiveMetadata", torrents[hash]);
		});
	}
	
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
	console.log(" library_path: "+playbox.library_path);
	console.log(" torrent_path: "+playbox.torrent_path);
	
	// dir scan of the torrents
	fs.readdir(playbox.torrent_path, function(err, files) {
		if(err) throw err;
		var i = files.length-1;
		if(i >= 0) {
			do {
				hash = files[i].toString();
				//if(add_archive_metadata_queue.length < 11) {
					add_archive_metadata_queue.push(playbox.torrent_path+hash);
				//}
			} while(i--);
		}
	});
	
	var music_dir = playbox.library_path.substr(0, playbox.library_path.indexOf("/Library"))+"/Music";
	add_media(music_dir);
	fs.stat(music_dir), function(err, st) {
		if(st.isFile()) {
			add_archive_queue.push(music_dir);
		} else {
			fs.readdir(playbox.torrent_path, function(err, files) {
				if(err) throw err;
				var i = files.length-1;
				if(i >= 0) {
					do {
						hash = files[i].toString();
						add_archive_metadata_queue.push(playbox.torrent_path+hash);
					} while(i--);
				}
			});
		}
	}
	
	// start the updates
	update_loop = setInterval(do_update, 100);
}

function add_media(p) {
	fs.stat(p, function(err, st) {
		if(err) throw err;
		if(st.isFile() && path.extname(p) === ".mp3") {
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

function get_metadata(path, got_metadata_callback, copy_to_library) {
	var chunkSize = 64 * 1024;
	var bufSize   = 512 * 1024; // half mega should be good for reading the id3 tag and enough buffer not to kill the hard disk if I write slowly
	var bufPos    = 0;
	var buf = new Buffer(bufSize);
	console.log("getting metadata");
	fs.createReadStream(
		path, {flags: 'r', encoding: 'binary', mode: 0666, bufferSize: chunkSize}
	).addListener("data", function(chunk) {
			var bufNextPos = bufPos + chunk.length;
			if(bufNextPos == bufSize) {
				buf.write(chunk,'binary',bufPos);
				res.write(buf);
				bufPos = 0;
			} else if(bufPos < bufSize) {
				buf.write(chunk,'binary',bufPos);
				bufPos = bufNextPos;
			}
		}
	).addListener("close",function() {
		var id3 = new ID3File(buf);
		var tags = {};
		
		if(id3.parse()) {
			var t = id3.getTags();
			t["TALB"] && (tags["album"] = t["TALB"].data);
    		t["TAL"] && (tags["album"] = t["TAL"].data);
    		t["TCOM"] && (tags["composer"] = t["TCOM"].data);
    		t["TCON"] && (tags["genre"] = t["TCON"].data);
    		t["TCO"] && (tags["genre"] = t["TCO"].data);
    		t["TCOP"] && (tags["copyright"] = t["TCOP"].data);
    		t["TDRL"] && (tags["date"] = t["TDRL"].data);
    		t["TDRC"] && (tags["date"] = t["TDRC"].data);
    		t["TENC"] && (tags["encoded_by"] = t["TENC"].data);
    		t["TEN"] && (tags["encoded_by"] = t["TEN"].data);
    		t["TIT2"] && (tags["title"] = t["TIT2"].data);
    		t["TT2"] && (tags["title"] = t["TT2"].data);
    		t["TLAN"] && (tags["language"] = t["TLAN"].data);
    		t["TPE1"] && (tags["artist"] = t["TPE1"].data);
    		t["TP1"] && (tags["artist"] = t["TP1"].data);
    		t["TPE2"] && (tags["album_artist"] = t["TPE2"].data);
    		t["TP2"] && (tags["album_artist"] = t["TP2"].data);
    		t["TPE3"] && (tags["performer"] = t["TPE3"].data);
    		t["TP3"] && (tags["performer"] = t["TP3"].data);
    		t["TPOS"] && (tags["disc"] = t["TPOS"].data);
    		t["TPUB"] && (tags["publisher"] = t["TPUB"].data);
    		t["TRCK"] && (tags["track"] = t["TRCK"].data);
    		t["TRK"] && (tags["track"] = t["TRK"].data);
    		t["TSOA"] && (tags["album-sort"] = t["TSOA"].data);
    		t["TSOP"] && (tags["artist-sort"] = t["TSOP"].data);
    		t["TSOT"] && (tags["title-sort"] = t["TSOT"].data);
		}
		
		got_metadata_callback(tags);
		
		
		
		/*
		 * LATER, probably in a different function called copy_to_library
		 *
		 * if(copy_to_libary) 
		fs.createWriteStream(
			playbox.library_path + hash, {flags: 'w', encoding: 'binary', mode: 0666, bufferSize: chunkSize }
		).addListener('drain', function(
		*/
		
		//if(bufPos != 0) {
			//res.write(buf.slice(0,bufPos));
			//res.end();
		//} else {
			//res.close();
		//}
		
	});
}

var _ext2mime = {
	"html": "text/html",
	"ico": "image/x-icon",
	"gif": "image/gif",
	"jpg": "image/jpeg",
	"jpg": "image/jpeg",
	"js": "text/javascript",
	"json": "application/json",
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
			c.file("audio/mp3", playbox.library_path+"/"+args);
			return;
			
		case 'i':
			var t = torrents[args];
			if(!t) {
				t = torrents[args] = {status:"LOOKUP"};
				//add_archive_metadata_queue.push(args);
				playbox.add_archive_metadata(args);
			}
			
			output.ret = t;
			//output.ret = playbox.archive(args);
			break;
			
		case '/':
			//c.file("application/xhtml+xml", "./apps/playbox/public/index.html");
			c.file("text/html; charset=utf-8", "./apps/playbox/public/index.html");
			return;
			
		default:
			var mime = ext2mime(path.extname(args));
			c.file(mime, "./public/"+args);
			return;
	}
	
	c._headers["Content-Type"] = "application/javascript";
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
	
}

exports.websocket_disconnect = function(c) {
	
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
