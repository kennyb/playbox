/*



*/

// download this for testing:
// http://github.com/cloudhead/vows

global.start_time = new Date();

var http = require("http"),
	sys = require("sys"),
	Url = require("url"),
	fs = require("fs"),
	buffer = require("buffer"),
	QueryString = require("querystring");

//var jsp = require("./lib/UglifyJS/lib/parse-js");
//var pro = require("./lib/UglifyJS/lib/process");

//var mongo = require('./lib/mongodb');
//var mongoose = require('./lib/mongoose');

// global objects
Playbox = require('./libs/playbox').Playbox;
Url = require("url");
QueryString = require("querystring");
//cookie = require( "./lib/cookie");

var conn_id = 0;

Connection = exports.Connection = function(req, res) {
	this._req = req;
	this._res = res;
	this._sid = null;
	this._ret = 200;
	this._session = null;
	this._input_string = "";
	this._funcs_done = null;
	this._output_string = "";
	
	this._headers = {
		"Content-Type": "application/xhtml+xml; charset=utf-8"
	};
	
	this._data = {};
	this._func_ret = {};
	this._funcs = {};
	this.request_time = new Date();
	
	// TODO set the encoding based on the header determined encoding
	req.setEncoding('utf8');
	this._url = Url.parse(req.url);
	var get = QueryString.parse(this._url.query);
	this._get = get;
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
	
	var static_file_url, static_file;
	if(req.method === "GET") {
		this._funcs_done = true;
		var path = this._url.pathname;
		if(path === '/') {
			//static_file_url = "/index.html";
			//this._headers["Cache-Control"] = "no-cache, must-revalidate";
			//this._headers["Pragma"] = "no-cache";
			//this._headers["Expires"] = "Fri, 01 Jan 2010 00:00:01 GMT";
			this._output_string = "<app>a welcoming poem</app>";
			this.end();
			return this;
		} else {
			//static_file_url = path;
			var app_name = path.substr(1),
				app_func = "/",
				app_func_offset = app_name.indexOf('/'),
				app_args = "";
			
			if(app_func_offset !== -1) {
				app_func = app_func_offset === app_name.length-1 ? "/" : app_name.substr(app_func_offset);
				app_name = app_name.substr(0, app_func_offset);
				
				if(app_func !== "/" && app_func.length > 1/* && app_func.charAt(0) === '/'*/) {
					app_func = app_func.substr(1);
					app_func_offset = app_func.indexOf('/');
				
					if(app_func_offset !== -1) {
						app_args = app_func.substr(app_func_offset+1);
						app_func = app_func.substr(0, app_func_offset);
					}
				}
			} else {
				switch(app_name) {
					case "crossdomain.xml":
						this._headers["Content-Type"] = "text/xml";
						this._output_string = "<?xml version=\"1.0\"?>"+
									"<cross-domain-policy>"+
										"<site-control permitted-cross-domain-policies=\"all\"/>"+
										"<allow-access-from domain=\"*\" />"+
									"</cross-domain-policy>";
						this.end();
						return this;
						
					case "favicon.ico":
						console.log("fixme");
				}
			}
			
			console.log("app", app_name);
			console.log("func", app_func);
			console.log("args", app_args);
			
			var app = apps[app_name];
			if(app !== undefined) {
				app.http(this, app_func, app_args);
				return this;
			}
		}
		
		
		static_file = global.static_files[static_file_url];
		
		if(static_file === undefined) {
			this._output_string = "404";
			this._headers["Content-Type"] = "text/html";
			this.end(404);
			return this;
		} else {
			this._output_string = static_file;
			this._headers["Content-Type"] = static_files_mime[static_file_url];
			
			if(typeof static_file === 'function') {
				this._funcs = null;
			} else {
				this.end();
				return this;
			}
		}
	}
	
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
	if(this._input_string) {
		this._funcs = JSON.parse(this._input_string);
	} else {
		this._funcs = {};
	}
	
	this.start();
};

Connection.prototype.start = function() {
	console.log(this.id + ": start "+(this._session && this._session._uid ? this._session._uid.toHexString() : null));
	var func = this._output_string;
	if(typeof func === 'function') {
		this._output_string = func(this, this._url.pathname);
	}
	
	if(this._output_string !== false) {
		this.end();
	}
}


Connection.prototype.print = function(str) {
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
	
	this._res.writeHead(this._ret || 200, this._headers);
	
	//this._res.shouldKeepAlive = false;
	if(output_str && output_str.length) {
		this._res.write(output_str);
	}
	
	this._res.end();
}

Connection.prototype.file = function(mime, file_path) {
	this._output_string = false;
	fs.stat(file_path, function(c) { return function (e, stat) {
		var res = c._res;
		
		if(e) {
			res.writeHead(404, this._headers);
			res.write("404!");
			res.end();
		} else if(stat.isFile()) {      // Stream a single file.
			c._headers['Content-Length'] = stat.size;
			c._headers['Content-Type'] = mime;
			res.writeHead(200, c._headers);
			
			(function streamFile(buffer, offset) {
				fs.createReadStream(file_path, {
					flags: 'r',
					encoding: 'binary',
					mode: 0666,
					bufferSize: 4096
				}).addListener('data', function (chunk) {
					buffer.write(chunk, offset, 'binary');
					c._res.write   (chunk, 'binary');
					offset    += chunk.length;
				}).addListener('close', function () {
					res.end();
				}).addListener('error', function (err) {
					c.end(500);
					//sys.error(err);
				});
			})(new(buffer.Buffer)(stat.size), 0);
			
		} else {
			res.writeHead(404, this._headers);
			res.write("404!");
			res.end(404);
		}
	}}(this));
}


global.static_files = {};
global.static_files_mime = {};


//TODO... this is caca. we should use the functions better, stat the files, etc
function add_file(path, vpath, mime, literal) {
	literal = literal || false;
	
	if(path.charAt(0) === '/') {
		path = path.substr(1);
	}
	
	if(vpath.charAt(0) !== '/') {
		vpath = '/'+vpath;
	}
	
	try {
		var content = fs.readFileSync(path);
		if(mime.indexOf("text/") !== -1 || mime.indexOf("application/") !== -1) {
			var txt = content.toString();
			var old_txt = global.static_files["/" + path];
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
				//console.log(txt);
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
				console.log("updated: "+path);
			};
		}(path, vpath, mime, literal));
		
	} catch(e) {
		console.log(" [ERROR] "+path+" :: "+e.message+" on line "+e.line);
		throw e;
	}
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

var apps = {};


//var config = JSON.parse("{lala:5}");
//fs.readFileSync("config.js");

fs.readdir("apps", function(err, files) {
	if(err) throw err;
	
	files.forEach(function(app) {
		console.log("loading:", app);
		apps[app] = require("./apps/"+app+"/exports.js");
	});
});

var server = http.createServer(
	function(req, res) {
		
		// DEBUG
		/*
		for(var i in global.static_files) {
			if(i.charAt(1) !== '!') {
				add_file(i, global.static_files_mime[i], typeof global.static_files[i] === 'string');
			}
		}
		//*/

		
		var c = new Connection(req, res);
	}
);


/*
//ast = jsp.parse('function f() {var v = "lala";v+="lala";v+="lala";v+="lala";return v;}');
ast = jsp.parse('var v = "lala";if(document) {v+="lala";v+="lala";}v+="lala";');
console.log(ast[1][0][3]);
ast = pro.ast_mangle(ast);
ast = pro.ast_squeeze(ast);
console.log(ast[1][0][3]);
console.log(pro.gen_code(ast, false));
*/

server.listen(1155, function() {
	console.log("listening on port: " + 1155);
});























// --------------------------
// --------------------------
// --------------------------
/*
var Playbox = require('./libs/playbox').Playbox;
var http = require("http");
var url = require("url");

var p = new Playbox();
p.init("Library");
p.start();

var server = http.createServer(function (req, res) {

	// the options are usually optional, accept for 'set'
	console.log(p.library()); // should print all of the songs
	console.log(p.info("1234")); // should throw an exception saying the number of arguments is bad
	console.log(p.info("...")); // should return the file information
	console.log(p.get("...")); // should return the file information
	console.log(p.set("...", {cmd: "download"})); // should return true or false
	
	res.writeHead(200, {"Content-Type": "application/javascript"});
	res.write(url.parse(req.url).pathname);
	res.write(JSON.stringify(p.library()))
	res.end();
});


server.listen(1155, "localhost", function(e) { console.log("listening on port", 1155); });

// stop the playbox
//p.stop();
*/