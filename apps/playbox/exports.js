
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
	playbox.update();
	//TODO: put limits.. no fumes discos duros
	if(add_archive_metadata_queue.length) {
		path = add_archive_metadata_queue.shift();
		console.log("add_archive_metadata", path);
		playbox.add_archive_metadata(path);
	} else if(add_archive_queue.length) {
		path = add_archive_queue.shift();
		console.log("add_archive", path);
		playbox.add_archive(path);
	}
};

playbox.on("archiveUnknown", function(e) {
	console.log("UNKNOWN ARCHIVE");
}).on("archivePaused", function(e) {
	console.log("PAUSED");
}).on("archiveResumed", function(e) {
	console.log("RESUMED");
}).on("archiveMetadata", function(e) {
	console.log("METADATA");
}).on("archiveDownloading", function(e) {
	console.log("DOWNLOADING");
}).on("archiveProgress", function(e) {
	console.log("PROGRESS");
}).on("archiveComplete", function(e) {
	console.log("COMPLETE", hash, e);
}).on("archiveRemoved", function(e) {
	console.log("REMOVED");
}).on("metadataAdded", function(hash, path) {
	add_archive_metadata_queue.push(path);
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
				add_archive_metadata_queue.push(playbox.torrent_path+hash);
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
			output.ret = playbox.query();
			break;
			
		case 'g':
			c.file("audio/mp3", playbox.library_path+"/"+args);
			return;
			
		case 'i':
			output.ret = playbox.info(args);
			break;
			
		default:
			output.ret = "invalid function";
	}
	
	c._headers["Content-Type"] = "application/javascript";
	c.print(JSON.stringify(output));
	c.end(output.status);
};

// start it up!
console.log("init:", init());

// debug shit
console.log("starting:", start());
