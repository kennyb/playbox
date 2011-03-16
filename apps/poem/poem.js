"use strict";

var Path = require('path'),
    Fs = require('fs'),
	ext2mime = require('lib/http').ext2mime;

exports.cmds = {
	status: function(params) {
		return {
			cache: 0,
			max_cache: 1024 * 100,
			used_cache: 0
		}
	},
	applist: function(params, callback) {
		/*
		var ret = [];
		for(var i in app_status) {
			ret.push(app_status[i]);
		}
		
		return ret;
		*/
		
		callback([
			{
				id: "poem",
				desc: "system",
				status: "ONLINE",
				cache: 0,
				max_cache: 1024 * 100,
				used_cache: 0
			},
			{
				id: "playbox",
				desc: "network music machine",
				status: "ONLINE",
				cache: 0,
				max_cache: 1024 * 100,
				used_cache: 0
			},
		]);
	},
	start: function(params) {
		throw new Error("not yet implemented");
	},
	stop: function(params) {
		throw new Error("not yet implemented");
	},
	reload: function(params) {
		throw new Error("not yet implemented");
	},
	force_quit: function(params) {
		throw new Error("not yet implemented");
	},
	install: function(params) {
		throw new Error("not yet implemented");
	},
	uninstall: function(params) {
		throw new Error("not yet implemented");
	}
};




/*
apps["poem"] = {
	cmds: exports.cmds
};
*/
