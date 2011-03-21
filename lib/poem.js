"use strict"

//TODO: add a cmd timeout, so that cmds will always return eventually

var Poem = require("./poem/app-manager");

var Cmd = function(app, cmd, params, callback, error) {
	var c = this;
	
	c.app = app;
	c.cmd = cmd;
	c.params = params;
	c.callback = callback;
	c.error = error;
	
	var poem_app = Poem.apps[app];
	if(typeof poem_app !== "object") {
		throw new Error("app is not installed correctly");
	}
	
	if(typeof poem_app.cmds !== "object") {
		throw new Error("app has not exported any cmds");
	}
	
	var cmd_f = poem_app.cmds[cmd];
	if(typeof cmd_f !== 'function') {
		throw new Error("cmd ("+cmd+"): function not defined");
	}
	
	cmd_f(params, callback, error);
	
	return c;
};

exports.Cmd = Cmd;