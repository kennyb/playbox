
var playbox = new Playbox();
playbox.init("Library");


exports.http = function(c, func, args) {
	var output = {
		func: func,
		args: args,
		status: 200,
		ret: null
	};
	
	switch(func) {
		case '-':
			output.ret = playbox.start();
			break;
			
		case 'o':
			output.ret = playbox.stop();
			break;
			
		case 'l':
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
