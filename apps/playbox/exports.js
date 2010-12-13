
var sys = require("sys"),
	fs = require('fs'),
	path = require('path'),
	buffer = require('buffer');

var playbox = new Playbox(),
	add_archive_queue = [],
	add_archive_metadata_queue = [],
	update_loop = null,
	torrents = {};

var do_update = function() {
	var path;
	process.nextTick(function() {
		playbox.update();
	});
	
	//TODO: put limits.. no fumes discos duros
	if(add_archive_metadata_queue.length) {
		path = add_archive_metadata_queue.shift();
		console.log("add_archive_metadata", path);
		process.nextTick(function() {
			playbox.add_archive_metadata(path);
		});
	} else if(add_archive_queue.length) {
		path = add_archive_queue.shift();
		console.log("add_archive", path);
		//process.nextTick(function() {
		//	playbox.add_archive(path);
		//});
	}
};

playbox.on("archiveUnknown", function(hash, e) {
	console.log("UNKNOWN ARCHIVE");
	torrents[hash] = {status:"UNKNOWN"};
});
playbox.on("archivePaused", function(hash, e) {
	console.log("PAUSED");
	torrents[hash].active = false;
});
playbox.on("archiveResumed", function(hash, e) {
	console.log("RESUMED");
	torrents[hash].active = true;
});
playbox.on("archiveMetadata", function(hash, e) {
	console.log("METADATA");
	torrents[hash] = {status:"METADATA", downloaded: -1};
});
playbox.on("archiveDownloading", function(hash, e) {
	torrents[hash].status = "DOWNLOADING";
	console.log("DOWNLOADING");
});
playbox.on("archiveProgress", function(hash, progress) {
	console.log("PROGRESS");
	torrents[hash].downloaded = progress;
});
playbox.on("archiveComplete", function(hash, e) {
	console.log("COMPLETE", hash, sys.inspect(e));
	torrents[hash].status = "DOWNLOADING";
});
playbox.on("archiveRemoved", function(hash, e) {
	console.log("REMOVED");
	torrents[hash].downloaded = -1;
});
playbox.on("metadataAdded", function(hash, path) {
	add_archive_metadata_queue.push(path);
});
playbox.on("listening", function(details) {
	console.log("LISTENING", details);
});
playbox.on("listeningFailed", function(details) {
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
	
	// dir scan of the library
	/*
	fs.readdir(playbox.library_path, function(err, files) {
		if(err) throw err;
		var i = files.length-1;
		if(i >= 0) {
			do {
				hash = files[i].toString();
				if(hash.length === 40) {
					torrents[hash] = {status:"LOOKUP"};
					//add_archive_queue.push(playbox.library_path + "/" + hash);
				}
			} while(i--);
		}
	});
	*/
	
	// dir scan of the torrents
	fs.readdir(playbox.torrent_path, function(err, files) {
		if(err) throw err;
		var i = files.length-1;
		if(i >= 0) {
			do {
				hash = files[i].toString();
				if(add_archive_metadata_queue.length < 11) {
					add_archive_metadata_queue.push(playbox.torrent_path+hash);
				}
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
	if(args) {
		/*for(var i in torrents) {
			var t = torrents[i];
			
		}*/
	}
	
	return ret;
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
			output.ret = update_loop > 0 ? true : false;
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
			output.ret = playbox.info(args);
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

// start it up!
console.log("init:", init());

// debug shit
console.log("starting:", start());
