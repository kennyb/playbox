
var sys = require("sys"),
	fs = require('fs'),
	path = require('path'),
	buffer = require('buffer');

var playbox = new Playbox(),
	update_loop = null,
	torrents = {};

var do_update = function() {
	playbox.update();
};

function start() {
	if(update_loop === null) {
		var ret = playbox.start();
		init();
		
		update_loop = setInterval(function(playbox) {
			return function() {
				playbox.update();
			};
		}(playbox), 2000);
		
		return ret;
	} else {
		return false;
	}
}

function stop() {
	if(update_loop !== null) {
		clearInterval(update_loop);
		update_loop = null;
		output.ret = playbox.stop();
	}
}

function init() {
	console.log("Initializing playbox-2");
	console.log(" library_path: "+playbox.library_path);
	console.log(" torrent_path: "+playbox.torrent_path);
	
	// dir scan of the library
	fs.readdir(playbox.library_path, function(err, files) {
		if(err) throw err;
		
		files.forEach(function(hash) {
			torrents[hash] = {status:"LOOKUP"};
		});
	});
	
	// dir scan of the torrents
	fs.readdir(playbox.torrent_path, function(err, files) {
		if(err) throw err;
		
		files.forEach(function(hash) {
			var t = torrents[hash];
			if(t) {
				if(t.status === "LOOKUP") {
					// a file was found in the library with this hash, load up the torrent
					torrents[hash].status = "VERIFY";
					
				} else {
					
				}
			}
		});
	});
	
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
			if(update_loop === null) {
				output.ret = playbox.start();
				update_loop = setInterval(do_update, 33);
			} else {
				update.ret = false;
			}
			
			break;
			
		case 'o':
			
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

// debug shit
start();
