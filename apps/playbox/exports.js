
var playbox = new Playbox();
playbox.init("Library");
playbox.start();

var do_update = function() {
	playbox.update();
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
			clearInterval(update_loop);
			output.ret = playbox.stop();
			break;
			
		case 'q':
			output.ret = playbox.query();
			break;
			
		case 'g':
			output.ret = false;
			output.status = 404;
			break;
			
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