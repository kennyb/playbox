/*



*/

// download this for testing:
// http://github.com/cloudhead/vows
"use strict";

global.start_time = new Date();

// global error handler

process.on('uncaughtException', function(sys) {
	return function(err) {
		console.log(" [ERROR] "+err.toString()+"\n"+(err.stack));
	};
}(require("sys")));
//*/

require.paths.unshift("lib");
require.paths.unshift("../../lib");
require.paths.unshift("lib/node-strtok");


// data



// exports

var http = require("http"),
	Module = require("module"),
	vm = require('vm'),
	Net = require("net"),
	Sys = require("sys"),
	Edb = require("edb"),
	Poem = require("./poem"),
	fs = require("fs"),
	io = require("./deps/socket.io"),
	buffer = require("buffer"),
	Connection = require('./connection').Connection;
	//cookie = require( "./lib/cookie");

// globals
global.__app = "global";
global.Buffer = require('buffer').Buffer;
global.Playbox = require('playbox').Playbox;

global.Log = {
	log: function(header, s) {
		console.log(" ["+header+"] ["+__app+"] "+s);
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
};

//var config = JSON.parse("{lala:5}");
//fs.readFileSync("config.js");

var config = {},
	applist = {},
	apps = Poem.apps,
	server = http.createServer(function(req, res) {
		new Connection(req, res);
	}),
	socket = io.listen(server, {flashPolicyServer: false});

//TODO lib func, move me
global.Mixin = function(target, source) {
	if(typeof source === "object") {
		for(var key in source) {
			if(source.hasOwnProperty(key)){
				target[key] = source[key];
			}
		}
	}
	
	return target;
};


function init() {
	global.static_files = {};
	global.static_files_mime = {};
	
	try {
		fs.readFile('config.json', function(err, content) {
			if(err) throw err;
			config = JSON.parse(content);
		});
	} catch(e) {
		Log.error("could not load config.json");
	}

	try {
		fs.readFile('config.json', function(err, content) {
			if(err) throw err;
			applist = JSON.parse(content);
		});
	} catch(e) {
		Log.error("could not load applist.json");
	}

	Log.info("Initializing...");
	Edb.init(".edb", function() {
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
	});
	
	
	/*
	// now, fuck up the require function to restrict access to the apps
	// by default, grant all applications super access (later, this will be restricted for all non-default apps)
	// -- WARNING --
	// at the moment this is the mayor chapuza of the app code
	// I will be spawning separate node processes for each application in the future, jailing them into a directory...
	// for now, !!!COMPLETE ACCESS!!! - hehe
	// if you wanna help out to sort this mess, let me know, I'm 110% of the way there
	
	
	(function(_load) {
		Module._load = function(path, self, app) {
			app = app || "global";
			console.log("loading module "+path, app);
			if(path.indexOf("./apps/"+app) === 0) {
				return _load(path, self);
			} else if(path.indexOf("./apps/") === 0) {
				throw new Error("application not allowed to load other application's modules");
			}
			
			switch(app) {
				case "playbox":
				case "unhosted":
				case "global": // <--- this is here for debug right now.
					return _load(path, self);
				
				default:
					throw new Error("application not allowed permissions");
			}
			
			return {};
		};
	}(Module._load));
	
	//TODO: remove the different paths and stuff from the require function so nothing can be loaded that isn't necessary :)
	(function(_require) {
		require = function(path) {
			return _require(path);
		};
	}(require));
	*/
	
	server.listen(1155, function() {
		Log.info("listening on port: " + 1155);
	});
	
	
	Poem.init({
		broadcast: function(s) {
			return function() {
				s.broadcast.apply(s, arguments);
			}
		}(socket)
	});
	
	//TODO move all this over to poem
	fs.readdir("apps", function(err, files) {
		if(err) throw err;
		
		for(var i in files) {
			var app = files[i];
			__app = app;
			Log.info("Initializing..");
			//require.paths.unshift("./apps/"+app);
			//apps[app] = require("./apps/"+app+"/"+app);
			fs.readFile("./apps/"+app+"/"+app+".js", function(app) {
				//TODO get the allowed modules from some sort of app repository
				var allowed_modules = ['sys', 'fs', 'path', 'crypto', 'assert', 'buffer'];
				
				
				return function(err, code) {
					if(err) throw err;
					
					var context = {
						__app: app,
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
						setTimeout: setTimeout,
						setInterval: setInterval,
						clearInterval: clearInterval,
						console: console,
						Playbox: Playbox
					};
					
					vm.runInNewContext(code, context, app);
					
					if(context.exports) {
						apps[app] = context.exports;
						if(typeof context.exports.init === 'function') {
							context.exports.init({
								broadcast: function(s) {
									return function() {
										s.broadcast.apply(s, arguments);
									}
								}(socket)
							});
						}
					} else {
						throw new Error("application does not export anything");
					}
				};
			}(app));
			
			__app = "global";
		}
	});
}


//TODO... this is caca. we should use the functions better, stat the files, etc
function add_file(path, vpath, mime, literal) {
	literal = literal || false;
	
	if(path.charAt(0) === '/') {
		path = path.substr(1);
	}
	
	if(vpath.charAt(0) !== '/') {
		vpath = '/'+vpath;
	}
	
	fs.readFile(path, function(err, content) {
		if(err) throw err;
		
		if(mime.indexOf("text/") !== -1 || mime.indexOf("application/") !== -1) {
			var txt = content.toString();
			var old_txt = global.static_files["/" + path];
			//TODO: this can all be done in parallel
			if(!literal && typeof txt === 'string' && txt.indexOf("<?") !== -1) {
				txt = 'o=o||"";o+="'+txt.str_replace_array(['"', "\n", "\t", "  "], ['\\"', "", " ", " "]).trim();
				txt = txt.trim().replace(/<\?(.*?)\?\>/g, function(nothing, variable) {
					variable = variable.str_replace_array(['\\"', "\n", "  "], ['"', "", " "]).trim();
					if(variable.charAt(variable.length-1) === ';') {
						variable = variable.substr(0, variable.length-1);
					}
					
					if((variable||"").substr(0,1) === '=') {
						return '";o+='+variable.substr(1).trim()+';o+="';
					} else {
						return '";'+variable+';o+="';
					}
				});
				
				//TODO - parse the output and make it more optimized before running it
				txt += '";return o;';
				txt = new Function("p", "c","o", txt);
			}
		
			if(mime === "text/javascript" && !literal) {
				try {
					/*
					var ast = jsp.parse(txt);
					ast = pro.ast_mangle(ast);
					ast = pro.ast_squeeze(ast);
					var code = pro.gen_code(ast, false);
					global.static_files["/!" + path] = code;
					*/
					global.static_files_mime["/." + path] = mime;
				} catch(e) {
					throw e;
				}
			}
		
			global.static_files[vpath] = txt;
		} else {
			global.static_files[vpath] = content;
		}
		
		global.static_files_mime[vpath] = mime;
		
		fs.watchFile(path, function(path, vpath, mime, literal) {
			return function(curr, prev) {
				add_file(path, vpath, mime, literal);
			};
		}(path, vpath, mime, literal));
	});
}

/*
function add_dir(dir, vdir) {
	vdir = vdir || dir;
	
	while(dir.substr(-1) === '/') {
		dir = dir.substr(0, dir.length - 1);
	}
	
	while(vdir.substr(-1) === '/') {
		vdir = vdir.substr(0, vdir.length - 1);
	}
	
	fs.readdir(dir, function(err, files) {
		if(err) throw err;
		
		files.forEach(function(file) {
			var full_file = dir+'/'+file;
			var full_vfile = vdir+'/'+file;
			
			fs.stat(full_file, function(err, stats) {
				if(err) throw err;
				
				if(stats.isDirectory()) {
					add_dir(full_file, full_vfile);
				} else {
					var ext = full_file.after('.');
					var type;
					
					switch(ext) {
						case "css":
							type = "text/css";
							break;
							
						case "js":
							type = "text/javascript";
							break;
							
						case "jpeg":
						case "jpg":
							type = "image/jpeg";
							break;
						
						case "gif":
							type = "image/gif";
							break;
						
						case "png":
							type = "image/png";
							break;
						
						case "ico":
							type = "image/x-icon";
							break;
						
						case "swf":
							type = "application/x-shockwave-flash";
							break;
						
						case "pdf":
							type = "application/pdf";
							break;
						
						case "mp3":
							type = "audio/mpeg";
							break;
						
						case "m3u":
							type = "audio/x-mpegurl";
							break;
						
						case "dtd":
						case "xml":
							type = "text/xml";
							break;
						
						case "html":
							type = "text/html; charset=utf-8";
							
						default:
							type = "text/plain";
					}
					
					if(ext !== "html") {
						add_file(full_file, full_vfile, type);
					}
				}
			});
		});
	});
}
*/

socket.on("connection", function(conn) {
	//conn.storage.set("username", "user_"+conn.id);
	conn.broadcast("<"+conn.sessionId+"> connected");
	
	conn.on("message", function(msg) {
		var msgs = [], rets = [], one = true;
		
		if(typeof msg !== "object") {
			msg = JSON.parse(msg);
		}
		
		if(typeof msg !== "object") {
			throw new Error("incorrect message format");
		}
		
		if(msg.length > 0) {
			msgs = msg;
			one = true;
		} else {
			msgs.push(msg);
		}
		
		var do_msg = function(msg) {
			var protocol = msg.protocol || msg.x,
				id = msg.id || msg.i,
				cmd = msg.cmd || msg.c,
				params = msg.params || msg.p,
				app = msg.app || msg.a;
			
			try {
				if(!protocol) {
					throw new Error("protocol not defined");
				}
				
				if(protocol !== "poem/RPC-1") {
					throw new Error("protocol not defined");
				}
				
				if(!id) {
					throw new Error("message id not defined");
				}
				
				if(!cmd) {
					throw new Error("message cmd not defined");
				}
				
				if(!params) {
					throw new Error("params not defined");
				}
				
				if(!app) {
					throw new Error("app not installed");
				}
				
				console.log("cmd("+id+"): "+app+"."+cmd+" "+Sys.inspect(params));
				
				app = apps[app];
				if(!app.cmds) {
					throw new Error("app does not have any cmds");
				}
				
				var cmd_f = app.cmds[cmd];
				if(typeof cmd_f !== 'function') {
					throw new Error("cmd ("+cmd+"): function not defined");
				}
				
				conn.send({id: id, ret: cmd_f(params)});
			} catch(e) {
				conn.send({id: id, error: e.toString()});
			}
		};
		
		// TODO: add a "waitfor" option to organize the order
		for(var i = 0; i < msgs.length; i++) {
			msg = msgs[i];
			process.nextTick(function() {
				do_msg(msg);
			});
		}
		
	}).on("disconnect", function() {
		//TODO apps[app_name].websocket_disconnect
		socket.broadcast("<"+conn.sessionId+"> disconnected");
	});
});

// crossdomain policy server 
Net.createServer(function(s) {
	s.write('<?xml version="1.0"?>'+
				'<cross-domain-policy>'+
					'<allow-access-from domain="*" to-ports="1111-1155"/>'+
				'</cross-domain-policy>');
	s.end();
	Log.info("sent policy file");
}).listen(1156);



/*
//ast = jsp.parse('function f() {var v = "lala";v+="lala";v+="lala";v+="lala";return v;}');
ast = jsp.parse('var v = "lala";if(document) {v+="lala";v+="lala";}v+="lala";');
console.log(ast[1][0][3]);
ast = pro.ast_mangle(ast);
ast = pro.ast_squeeze(ast);
console.log(ast[1][0][3]);
console.log(pro.gen_code(ast, false));
*/

init();


