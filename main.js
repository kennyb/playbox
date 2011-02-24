/*



*/

// download this for testing:
// http://github.com/cloudhead/vows

global.start_time = new Date();

// global error handler
/*
process.on('uncaughtException', function(sys) {
	return function(err) {
		//var stack = err.stack.split("\n");
		console.log(" [ERROR] "+err.toString()+"\n"+sys.inspect(err.stack)+"\n"+sys.inspect(err));
	};
}(require("sys")));
//*/

require.paths.unshift("lib");
require.paths.unshift("../../lib");
require.paths.unshift("lib/node-strtok");

var __app = "global",
	http = require("http"),
	Module = require("module"),
	vm = require('vm'),
	Net = require("net"),
	Sys = require("sys"),
	Url = require("url"),
	Edb = require("edb"),
	fs = require("fs"),
	io = require("./deps/socket.io"),
	buffer = require("buffer"),
	Url = require("url"),
	QueryString = require("querystring");
	//cookie = require( "./lib/cookie");

// globals
Buffer = require('buffer').Buffer;
Playbox = require('playbox').Playbox;

Log = {
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

var conn_id = 0,
	config = {},
	applist = {};
	apps = {},
	server = http.createServer(function(req, res) {
		new Connection(req, res);
	}),
	socket = io.listen(server, {flashPolicyServer: false});

//TODO lib func, move me
Mixin = function(target, source) {
	if(typeof source === "object") {
		for(var key in source) {
			if(source.hasOwnProperty(key)){
				target[key] = source[key];
			}
		}
	}
	
	return target;
};

Connection = exports.Connection = function(req, res) {
	// TODO set the encoding based on the header determined encoding
	req.setEncoding('utf8');
	//res.headers["Content-Type"] = "application/xhtml+xml; charset=utf-8";
	//res.statusCode = 500;
	
	this._req = req;
	this._res = res;
	this._sid = null;
	this._ret = 200;
	this._session = null;
	this._input_string = "";
	this._funcs_done = null;
	this._output_string = false;
	this._headers = {
		"Content-Type": "application/xhtml+xml; charset=utf-8"
	};
	
	this._data = {};
	this._func_ret = {};
	this._funcs = {};
	this.request_time = new Date();
	
	this._url = Url.parse(req.url);
	this._get = QueryString.parse(this._url.query);
	//this._sid = new String(req.getCookie("sid")).toString();
	this.id = (conn_id++) + "# " + this._url.pathname;
	
	req.on('end', function(connection) {
		return function() {
			connection.onDataEnd.call(connection);
		}
	}(this)).on('data', function(connection) {
		return function(chunk) {
			connection.onData.call(connection, chunk);
		}
	}(this));
	
	/*
	var Session = global.db.model("Session");
	if(this._sid !== null) {
		// load the session
		if(Session) {
			Session.find(
				  {sid: this._sid} // , d_expires: {$lt: this.request_time}
			).first(function(c) {
				return function(data) {
					//console.log(c.id + ": getting session");
					if(data === null) {
						// create a session
						c._session = new Session();
						c._session.sid = c._sid = LIB.rand_str(26);
						//this._session.d_expires = new Date()
					} else {
						c._session = data;
					}
					
					c.start.call(c);
				};
			}(this));
		}
	}
	*/
	
	return this;
};

/*
Connection.prototype.mangle_func = function(func, params) {
	
	var values = params ? LIB.values(params).join(',') : "";
	
	return '!'+func+ (values.length ? '-'+LIB.keys(params).join(',')+'-'+values : "");
}

Connection.prototype.func = function(name, params) {
	if(params === undefined) {
		params = {};
	}
	
	name = new String(name).toString();
	//try {
		var func, func_ret;
		var model_name = name.until('.');
		var name_mangled = this.mangle_func(name, params);
		if(model_name) {
			// object function
			var model = global.db.model(model_name);
			var func_name = name.after('.');
			
			func = model[func_name];
			if(typeof func === 'function') {
				func.call(model, this, name_mangled, params);
			}
		} else if((func = FUNCTIONS[name]) !== undefined) {
			// global function
			func(this, name_mangled, params);
		} else {
			// model id
			var model = global.db.model(name), id;
			if(model) {
				func = true;
				if(!(params instanceof Array)) {
					params = [params];
				}
				
				for(var i = 0; i < params.length; i++) {
					name_mangled = this.mangle_func(name, params[i]);
					model.find(params[i]).first(function(connection, name_mangled) {
						return function(d) {
							connection.func_ret(name_mangled, d);
						};
					}(this, name_mangled));
				}
			} else {
				this.func_ret(name, {$error: "model '"+name+"' does not exist"});
			}
		}
		
		if(func !== undefined) {
			this._headers["Content-Type"] = "application/x-javascript; charset=utf-8";
			return true;
		} else {
			this.func_ret(name, {$error: "function '"+name+"' does not exist"});
		}
	//} catch(e) {
	//	console.log("ERROR "+e);
	//	this._func_ret[name] = {error: e.toString()};
	//	this.end();
	//}
	
	return undefined;
}
*/

Connection.prototype.onData = function(chunk) {
	// do I need a buffer here?
	this._input_string += chunk;
}

Connection.prototype.onDataEnd = function() {
	if(this._input_string.length) {
		this._post = QueryString.parse(this._input_string);
	} else {
		this._post = {};
	}
	
	this.start();
};

Connection.prototype.start = function() {
	var func = this._output_string,
		static_file_url, static_file,
		method = this._req.method;
	
	if(typeof func === 'function') {
		this._output_string = "";
		this._output_string = func(this, this._url.pathname);
	}
	
	if(this._output_string !== false) {
		this.end();
		return;
	}
	
	this._funcs_done = true;
	var path = QueryString.unescape(this._url.pathname);
	if(path === '/') {
		//static_file_url = "/index.html";
		//this._headers["Cache-Control"] = "no-cache, must-revalidate";
		//this._headers["Pragma"] = "no-cache";
		//this._headers["Expires"] = "Fri, 01 Jan 2010 00:00:01 GMT";
		this._output_string = "<app>a welcoming poem</app>";
		this.end();
	} else {
		//static_file_url = path;
		var app_name = path.substr(1),
			app_path = "/",
			app_path_offset = app_name.indexOf('/');
		
		if(app_path_offset !== -1) {
			app_path = app_path_offset === app_name.length-1 ? "/" : app_name.substr(app_path_offset);
			app_name = app_name.substr(0, app_path_offset);
			
			if(app_path !== "/" && app_path.length > 1/* && app_path.charAt(0) === '/'*/) {
				app_path = app_path.substr(1);
			}
		}
		
		Log.log("HTTP", "path "+path+" app "+app_name+" func "+app_path);
		
		var app = apps[app_name];
		if(app !== undefined) {
			try {
				__app = app_name;
				app.http(this, app_path);
			} catch(e) {
				var msg = e.toString();
				this.print(msg);
				this.end(parseInt(msg, 10) || 500);
			} finally {
				__app = "global";
			}
		} else if(method === "GET") {
			switch(app_name) {
				case "crossdomain.xml":
					//TODO SOME FORM OF SECURITY!!
					// maybe implement this as an application :)
					this._headers["Content-Type"] = "text/xml";
					this._output_string = '<?xml version="1.0"?>'+
								'<cross-domain-policy>'+
									'<site-control permitted-cross-domain-policies="all"/>'+
									'<allow-access-from domain="*"/>'+
									//'<allow-http-request-headers-from domain="*" headers="*"/>'+
								'</cross-domain-policy>';
					this.end();
				break;
				default:
					static_file = global.static_files[app_name];

					if(static_file === undefined) {
						this._output_string = "404";
						this._headers["Content-Type"] = "text/html";
						this.end(404);
					} else {
						this._output_string = static_file;
						this._headers["Content-Type"] = static_files_mime[app_name];

						if(typeof static_file === 'function') {
							this._funcs = null;
						} else {
							this.end();
						}
					}
				break;
			}
		}
	}
}


Connection.prototype.print = function(str) {
	if(this._output_string === false) {
		this._output_string = "";
	}
	 
	this._output_string += str.toString();
};

Connection.prototype.end = function(ret_code) {
	var output_str = this._output_string || "";
	
	// TODO update the expire time in both the session and the cookie 
	//this._res.setCookie("sid", this._sid);
	
	if(output_str.length === 0) {
		var output = {};
		
		if(this._data.length !== 0) {
			output.data = this._data;
		}
		
		if(this._func_ret.length !== 0) {
			output.ret = this._func_ret;
		}
		
		output_str = JSON.stringify(output);
	}
	
	this._res.writeHead(this._ret || 200, this._headers); // DEPR
	
	//this._res.shouldKeepAlive = false;
	if(output_str && output_str.length) {
		//this._res.statusCode = 200;
		this._res.write(output_str);
	}
	
	this._res.end();
}

Connection.prototype.file = function(mime, file_path) {
	this._output_string = false;
	var res = this._res;
	try {
		fs.stat(file_path, function(err, stat) {
			if(err) throw err;
			
			if(stat.isFile()) {      // Stream a single file.
				//c._res.headers['Content-Length'] = stat.size;
				//c._res.headers['Content-Type'] = mime;
				//c._res.statusCode = 200;
				this._headers['Content-Length'] = stat.size;
				this._headers['Content-Type'] = mime;
				res.writeHead(200, this._headers);
				
				(function streamFile(c, buffer, offset) {
					fs.createReadStream(file_path, {
						flags: 'r',
						encoding: 'binary',
						mode: 0666,
						bufferSize: 4096
					}).on('data', function (chunk) {
						buffer.write(chunk, offset, 'binary');
						c._res.write(chunk, 'binary');
						offset    += chunk.length;
					}).on('close', function () {
						res.end();
					}).on('error', function (err) {
						c.end(500);
						//Sys.error(err);
					});
				})(this, new(buffer.Buffer)(stat.size), 0);
			} else {
				res.writeHead(404, this._headers);
				res.write("404!");
				res.end(404);
			}
		});
	} catch(e) {
		res.writeHead(500, this._headers);
		res.write(e.message+"\n"+e.stack);
		res.end();
	}
}

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
				txt = txt.trim().replace(/\<\?(.*?)\?\>/g, function(nothing, variable) {
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

// BEGIN~~~

//global.host = "127.0.0.1";
//global.port = 27017;


/*
add_file("js/lib.js", "text/javascript");
add_file("js/site.js", "text/javascript");
add_file("js/dynarch.js", "text/javascript", true);
add_file("css/screen.css", "text/css");
add_file("css/default.css", "text/css");
add_file("public/unknown.png", "image/png");
add_file("public/tema.png", "image/png");
add_file("public/index.html", "application/xhtml+xml; charset=utf-8");
add_file("public/templates.html", "text/html; charset=utf-8", true);
*/
//add_file("public/index.html", "index.html", "application/xhtml+xml; charset=utf-8");
//add_file("public/templates.html", "templates.html", "text/html; charset=utf-8", true);

//add_dir("public/", "/");


socket.on("connection", function(conn) {
	//conn.storage.set("username", "user_"+conn.id);
	conn.broadcast("<"+conn.sessionId+"> connected");
	
	conn.on("message", function(msg) {
		var msgs = [],
			decoded = JSON.decode(msg);
		
		if(typeof decoded !== "object") {
			throw new Error("incorrect message format");
		}
		
		if(decoded.length > 0) {
			msgs = decoded;
		} else {
			msgs.push(decoded);
		}
		
		// TODO
		// add a "waitfor" option to organize the order
		for(var i = 0; i < funcs.length; i++) {
			var msg = funcs[i];
			
			if(!msg.protocol) {
				throw new Error("protocol not defined");
			}
			
			if(!msg.cmd) {
				throw new Error("cmd not defined");
			}
			
			if(!msg.params) {
				throw new Error("params not defined");
			}
			
			var app = apps[app_name];
			if(!app) {
				throw new Error("app not installed");
			}
			
			if(typeof app.cmds !== 'object') {
				
			}
			
			var cmd = app[msg.cmd];
			if(cmd !== 'function') {
				throw new Error("function not defined");
			}
			
			//Log.log("SOCK", "path "+path+" app "+app_name+" func "+app_path);
			cmd(msg.params);
		}
		
		if(app_path_offset !== -1) {
			app_path = app_path_offset === app_name.length-1 ? "/" : app_name.substr(app_path_offset);
			app_name = app_name.substr(0, app_path_offset);
			
			if(app_path !== "/" && app_path.length > 1/* && app_path.charAt(0) === '/'*/) {
				app_path = app_path.substr(1);
			}
		}
		
		
		
		var app = apps[app_name];
		if(app !== undefined && typeof app.http === 'function') {
			//CURRENT: need try/catch?
			
			var ret = {
				_conn: conn,
				_output_string: "",
				_headers: {},
				ret: null,
				print: function(str) {
					this._output_string += str.toString();
				},
				end: function(ret) {
					this._conn.send(this._output_string);
				}
			};
			
			app.http(ret, app_path);
			__app = "global";
		}
	}).on("disconnect", function() {
		//TODO apps[app_name].websocket_disconnect
		socket.broadcast("<"+conn.sessionId+"> disconnected");
	})
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
