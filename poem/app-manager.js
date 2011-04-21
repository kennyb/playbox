
var Fs = require('fs'),
	Edb = require("lib/edb"),
	vm = require('vm'),
	Module = require("module"),
	EventEmitter = require('events').EventEmitter,
	Util = require('util'),
	Path = require('path'),
	ext2mime = require('../lib/http').ext2mime;

var apps = {},
	applist = {},
	app_status = {},
	args,
	Poem = exports,
	working_dir = process.env["HOME"] + "/Library/poem/",
	tmp_dir = process.env["TMPDIR"] || working_dir+".tmp/";


var default_http_router = function(app, ext2mime) {
	return function(c, path) {
		switch(path) {
			case "/":
				c.file("text/html; charset=utf-8", "./apps/"+app+"/public/"+app+".html");
				break;
			
			default:
				var mime = ext2mime(Path.extname(path)) || "text/plain";
				c.file(mime, "./apps/"+app+"/public/"+path);
				return;
		}
	};
};


exports.apps = apps;

exports.init = function(opts) {
	broadcast = opts.broadcast;
	args = opts.args;
	
	try {
		Fs.readFile('applist.json', function(err, content) {
			if(err) throw err;
			applist = JSON.parse(content);
		});
	} catch(e) {
		Log.error("could not load applist.json");
	}
	
	Fs.mkdirs(working_dir.substr(0, working_dir.length-1), '755', function(err) {
		if(err) throw err;
		
		Log.info("Initializing: " + working_dir);
		Edb.init(working_dir+".edb/", function() {
			Log.info("Edb initialized");
	
			Edb.get("applist", function(key, value) {
				if(typeof value === 'undefined') {
					// running the playbox for the very first time
					// do more first time stuff, like loading the local library
					Edb.set("applist", applist);
				} else {
					Mixin(applist, value);
				}
			});
			
			load_apps();
		});
	});
};


function load_apps() {
    //TODO move all this over to poem
	Fs.readdir("apps", function(err, files) {
		if(err) throw err;
		
		for(var i in files) {
			var app = files[i];
			__app = app;
			Log.info("Initializing..");
			//require.paths.unshift("./apps/"+app);
			//apps[app] = require("./apps/"+app+"/"+app);
			Fs.readFile("./apps/"+app+"/"+app+".js", function(app) {
				//TODO get the allowed modules from some sort of app repository
				var allowed_modules = ['sys', 'fs', 'path', 'crypto', 'assert', 'buffer'];
				
				
				return function(err, code) {
					if(err) {
						//throw err;
						code = "";
					}
					
					// this is a lame hack right now to keep an applicaton inside of an application.
					// its usefulness is limited to the amount of time that it takes me to make applications actually sandboxed in their own process
					// it's obvious that I need them to run in their own thread to prevent an infinite loop from fucking everyone else (chromium vs. firefox)
					var context = {
						__app: app,
						args: args[app] || {},
						exports: {},
						Module: {
							_load: function(path, self) {
								Module._load(path, self, app);
							}
						},
						require: function(path) {
							if(path.indexOf("./") === 0) {
								if(path.indexOf("./apps/") === -1) {
									path = "./apps/"+app+"/"+path.substr(2);
								}
							} else if(path.indexOf("lib/") === 0) {
								path = "./"+path;
							} else if(allowed_modules.indexOf(path) === -1) {
								throw new Error("module '"+path+"' not allowed");
							}
							
							return Module._load(path, this, app);
						},
						Edb: {
							get: function(k, c) {
								return Edb.get(app+"."+k, c);
							},
							set: function(k, v, c) {
								return Edb.set(app+"."+k, v, c);
							},
							rm: function(k, c) {
								return Edb.rm(app+"."+k, c);
							},
							list: function(p, c) {
								return Edb.list(app+"."+p, c);
							}
						},
						Log: {
							log: function(header, s) {
								console.log(" ["+header+"] ["+app+"] "+s);
							},
							info: function(s) {
								Log.log("*", s);
							},
							error: function(s) {
								Log.log("!", s);
							},
							debug: function(s) {
								Log.log("DEBUG", s);
							}
						},
						Buffer: Buffer,
						Mixin: Mixin,
						Path: Path,
						EventEmitter: EventEmitter,
						Util: Util,
						setTimeout: setTimeout, //TODO: wrap this function so apps can't jump out of their context
						setInterval: setInterval, //TODO: same
						clearInterval: clearInterval, //TODO: same
						broadcast: broadcast,
						emit_event: function(app, broadcast) {
							return function(evt, data) {
								data = data || {};
								
								// TODO: add functionality here to check to see which clients have 'subscribed' to the events
								// or rather, that they are listening to the events (and also automatically export the functions
								// to add / remove event listeners
								broadcast({
									app: app,
									func: "event",
									args: evt,
									data: data
								});
							};
						}(app, broadcast),
						console: console,
						working_dir: working_dir + app + '/',
						tmp_dir: tmp_dir + app + '/',
						Playbox: Playbox
					};
					
					if(app === "playbox") {
						context.process = process;
					}
					
					if(app === "poem") {
						context.Poem = Poem;
					}
					
					Fs.mkdirs(context.tmp_dir, '755', function(err) {
						if(err) throw err;
						
						Fs.mkdirs(context.working_dir, '755', function(err) {
							if(err) throw err;
						
							try {
								vm.runInNewContext(code, context, "apps/"+app+"/"+app+".js");

								if(context.exports) {
									Poem.apps[app] = context.exports;
									if(!context.exports.http) {
										context.exports.http = default_http_router(app, ext2mime);
									}

								} else {
									throw new Error("application does not export anything");
								}
							} catch(e) {
								throw new Error("apps/"+app+"/"+app+".js:: " + e.toString());
							}
						});
					});
				};
			}(app));
			
			__app = "global";
		}
	});
}
