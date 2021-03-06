"use strict";

global.start_time = new Date();

/*// global error handler
process.on('uncaughtException', function(sys) {
	return function(err) {
		console.log(" [ERROR] "+err.toString()+"\n"+(err.stack));
	};
}(require("sys")));
//*/

require.paths.unshift(".");

//TODO fixme~!!!
require.paths.unshift("lib/node-strtok");

var http = require("http"),
	Fs = require("fs"),
	Module = require("module"),
	Net = require("net"),
	Path = require("path"),
	Sys = require("sys"),
	Edb = require("lib/edb"),
	Poem = require("./poem/app-manager"),
	io = require("lib/socket.io"),
	async = require("lib/async.js/async"),
	buffer = require("buffer"),
	Connection = require('./connection').Connection,
	Cmd = require("./lib/poem").Cmd,
	ext2mime = require('./lib/http').ext2mime;
	//cookie = require( "./lib/cookie");

// I needed a mkdirs function, so I put it here... needs to be moved
// the problem with this function, is if it's called multiple times on the same subdirectory, it will fail...
// for example:
// mkdirs("dir1/dir1/dir1");
// mkdirs("dir1/dir1/dir2");
// mkdirs("dir1/dir2/dir1");
// mkdirs("dir1/dir2/dir2");
// this is because of the async nature of nodejs
// work on this... it's a general problem with node, but it can be worked out, by making a closure for the function, with a static variable to make sure no two directories are ever attempted to be created twice
Fs.mkdirs = function() {
	var allPaths = {};
	
	return function (dirname, mode, callback) {
		if(typeof mode === 'function') {
			callback = mode;
			mode = undefined;
		}
		
		if(mode === undefined) mode = (0x1ff ^ process.umask()).toString(8);
		var pathsCreated = [], pathsFound = [];
		var makeNext = function() {
			var fn = pathsFound.pop();
			if(!fn) {
				if(callback) {
					callback(null, pathsCreated);
				}
			} else {
				Fs.mkdir(fn, mode, function(err) {
					if(!--allPaths[fn]) {
						delete allPaths[fn];
					}
					
					if(!err) {
						pathsCreated.push(fn);
						makeNext();
					} else if(callback) {
						callback(err);
					}
				});
			}
		};
		
		var findNext = function(fn){
			Fs.stat(fn, function(err, stats) {
				if(err) {
					if(err.code === 'ENOENT') {
						if(!allPaths[fn]) {
							allPaths[fn] = allPaths[fn] ? ++allPaths[fn] : 1;
							pathsFound.push(fn);
						}
						findNext(Path.dirname(fn));
					} else if(callback) {
						callback(err);
					}
				} else if(stats.isDirectory()) {
					// create all dirs we found up to this dir
					makeNext();
				} else {
					if(callback) {
						callback(new Error('Unable to create directory at '+fn));
					}
				}
			});
		};
		
		findNext(dirname);
	};
}();

// globals
global.__app = "global";
global.Buffer = require('buffer').Buffer;
global.Playbox = require('lib/playbox').Playbox;

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

var config = {},
	server = http.createServer(function(req, res) {
		new Connection(req, res);
	}),
	socket = io.listen(server, {flashPolicyServer: false}); // TODO: patch socket.io to let the flash policy server to be located on a different port

//TODO lib func, move me
global.Mixin = function(target, source) {
	if(typeof source === "object") {
		for(var key in source) {
			if(source.hasOwnProperty(key)) {
				target[key] = source[key];
			}
		}
	}
	
	return target;
};

//TODO lib func, move me
// one idea I have is to eventually embed mongo's bson engine
// until I do that, I'm just going to simulate a lot of the functions of mongo's update function
// I dunno why it's global. I guess I just didn't know where else to put it
global.Update = function(obj, update) {
	var updated = {};
	if(typeof obj === 'object' && typeof update === 'object') {
		for(var key in update) if(update.hasOwnProperty(key)) {
			var u = update[key];
			//TODO: refactor this, to check charAt(0) === '$' - and instead run the cmd, else update the field with the value
			// this is also proper so we can detect if a command is not supported yet or whatever
			switch(key) {
				case "$dec":
					for(key in u) if(u.hasOwnProperty(key)) {
						if(typeof obj[key] === 'number') {
							obj[key] -= u[key];
							updated[key] = obj[key];
						} else {
							throw new Error("$inc error")
						}
					}
					
				break;
				case "$inc":
					for(key in u) if(u.hasOwnProperty(key)) {
						if(typeof obj[key] === 'number') {
							obj[key] += u[key];
							updated[key] = obj[key];
						} else {
							throw new Error("$inc error")
						}
					}
					
				break;
				case "$update":
					for(key in u) if(u.hasOwnProperty(key)) {
						if(typeof obj[key] === 'object' && typeof u[key] === 'function') {
							updated[key] = obj[key] = u[key](obj[key]);
						} else {
							throw new Error("$update is not a function")
						}
					}
					
				break;
				case "$concat":
					for(key in u) if(u.hasOwnProperty(key)) {
						if(typeof obj[key] === 'object' && typeof obj[key].concat === 'function') {
							obj[key] = obj[key].concat(u[key]);
							updated[key] = obj[key];
						} else {
							console.log("$concat error", key, obj[key], u[key], obj);
						}
					}
					
				break;
				case "$push":
					for(key in u) if(u.hasOwnProperty(key)) {
						if(typeof obj[key] === 'object' && typeof obj[key].push === 'function') {
							obj[key].push(u[key]);
							updated[key] = obj[key];
						} else {
							console.log("$push error", key, obj[key], u[key], obj);
						}
					}
					
				break;
				default:
					if(typeof u !== 'undefined' && obj[key] !== u) {
						obj[key] = u;
						updated[key] = u;
					}
			}
		}
	}
	
	return updated;
};

//TODO lib func, move me
global.empty = function(obj) {
	if(typeof obj === 'object') {
		for(var key in obj) {
			if(obj.hasOwnProperty(key) && typeof obj[key] !== 'undefined') {
				return false;
			}
		}
	}
	
	return true;
};

global.count = function(arr) {
	var count = 0;
	//TODO: add query parameters
	
	for(var key in arr) if(arr.hasOwnProperty(key)) {
		count++;
	}
	
	return count;
};

function init() {
	/*
	// now, fuck up the require function to restrict access to the apps
	// by default, grant all applications super access (later, this will be restricted for all non-default apps)
	// -- WARNING --
	// at the moment this is the mayor chapuza of the app code
	// I will be spawning separate node processes for each application in the future, jailing them into a directory...
	// this will be done reusing a lot of the multi-node code (https://github.com/kriszyp/multi-node)
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

	var args = {poem: {listen: '1155'}};
	process.argv.forEach(function(val, index) {
		if(index > 1) {
			var app_offset = val.indexOf('.');
			var val_offset = val.indexOf('=');
			if(app_offset !== -1 && val_offset > app_offset) {
				var a = val.substr(0, app_offset++);
				var k = val.substr(app_offset, val_offset - app_offset);
				var v = val.substr(++val_offset);
				if(typeof args[a] !== 'object') {
					args[a] = {};
				}
				
				args[a][k] = v;
			} else {
				console.log("invalid param '"+val+"'");
			}
		}
	});
	
	//TODO: localhost should also work, even if it's bound to a different ip address
	// -- and in the future, binding to more than one ip address...
	
	var host = '127.0.0.1';
	var port = args.poem.listen;
	var port_offset = port.indexOf(':');
	if(port_offset !== -1) {
		host = port.substr(0, port_offset++);
		port = port.substr(port_offset) * 1;
	} else {
		port = port * 1;
	}
	
	console.log("port:", port, "host:", host, "port_offset", port_offset);
	server.listen(port, host, function() {
		Log.info("listening on: "+host+':'+port);
		Poem.init({
			broadcast: broadcast,
			args: args
		});
	});
	
	/*
	// crossdomain policy server 
	Net.createServer(function(s) {
		s.write('<?xml version="1.0"?>'+
					'<cross-domain-policy>'+
						'<allow-access-from domain="*" to-ports="1111-1155"/>'+
					'</cross-domain-policy>');
		s.end();
		Log.info("sent policy file");
	}).listen(1156);
	*/
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
	
	Fs.readFile(path, function(err, content) {
		if(err) throw err;
		
		if(mime.indexOf("text/") !== -1 || mime.indexOf("application/") !== -1) {
			var txt = content.toString();
			var old_txt = global.static_files["/" + path];
			//TODO: this can all be done in parallel
			//TODO: update this with the updated templates on the client side
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
		
		Fs.watchFile(path, function(path, vpath, mime, literal) {
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
	
	Fs.readdir(dir, function(err, files) {
		if(err) throw err;
		
		files.forEach(function(file) {
			var full_file = dir+'/'+file;
			var full_vfile = vdir+'/'+file;
			
			Fs.stat(full_file, function(err, stats) {
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
				
				// I may relax this and instead make it an empty object
				if(!params) {
					throw new Error("params not defined");
				}
				
				if(!app) {
					throw new Error("app not specified");
				}
				
				console.log("cmd("+id+"): "+app+"."+cmd+" "+Sys.inspect(params));
				var c = new Cmd(app, cmd, params, function(ret, common) {
					var msg = {id: id, ret: ret};
					if(common) {
						msg.common = common;
					}
					
					conn.send(msg);
				}, function(error) {
					conn.send({id: id, error: error.toString()});
				});
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


global.static_files = {};
global.static_files_mime = {};
global.broadcast = function(s) {
	return function() {
		s.broadcast.apply(s, arguments);
	}
}(socket);

try {
	Fs.readFile('config.json', function(err, content) {
		if(err) throw err;
		config = JSON.parse(content);
	});
} catch(e) {
	Log.error("could not load config.json");
}


init();



/*
//ast = jsp.parse('function f() {var v = "lala";v+="lala";v+="lala";v+="lala";return v;}');
ast = jsp.parse('var v = "lala";if(document) {v+="lala";v+="lala";}v+="lala";');
console.log(ast[1][0][3]);
ast = pro.ast_mangle(ast);
ast = pro.ast_squeeze(ast);
console.log(ast[1][0][3]);
console.log(pro.gen_code(ast, false));
*/


