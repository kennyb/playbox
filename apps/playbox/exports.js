
var sys = require("sys"),
	fs = require('fs'),
	path = require('path'),
	buffer = require('buffer');
var playbox = new Playbox();
var update_loop = null;
var file;

playbox.init("Library");
start();


var do_update = function() {
	playbox.update();
};

function start() {
	if(update_loop === null) {
		var ret = playbox.start();
		
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
var update_loop = setInterval(do_update, 2000);
