
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
		playbox.add_archive_metadata(playbox.torrent_path + path);
	} else if(add_archive_queue.length) {
		path = add_archive_queue.shift();
		playbox.add_archive(playbox.library_path + path);
	}
};

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
	fs.readdir(playbox.library_path, function(err, files) {
		if(err) throw err;
		var i = files.length-1;
		if(i >= 0) {
			do {
				hash = files[i].toString();
				if(hash.length === 40) {
					torrents[hash] = {status:"LOOKUP"};
					add_archive_queue.push(hash);
					console.log(" =>", hash);
				}
			} while(i--);
		}
	});
	
	// dir scan of the torrents
	fs.readdir(playbox.torrent_path, function(err, files) {
		if(err) throw err;
		var i = files.length-1;
		if(i >= 0) {
			do {
				hash = files[i].toString();
				add_archive_metadata_queue.push(hash);
			} while(i--);
		}
	});
	
	// start the updates
	update_loop = setInterval(do_update, 100);
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
