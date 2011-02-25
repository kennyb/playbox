
var apps = {};
var app_status = {};
var broadcast;

exports.init = function(opts) {
	broadcast = opts.broadcast;
	
	console.log("poem initialized");
};


exports.apps = apps;
exports.cmds = {
	list: function(params) {
		/*
		var ret = [];
		for(var i in app_status) {
			ret.push(app_status[i]);
		}
		
		return ret;
		*/
		
		return [
			{
				id: "playbox",
				status: "ONLINE"
			}
		];
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

apps["poem"] = {
	cmds: exports.cmds
};
