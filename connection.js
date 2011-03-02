"use strict";

var fs = require("fs"),
	Url = require("url"),
	QueryString = require("querystring"),
	Url = require("url"),
	Poem = require("./poem/app-manager"),
	ext2mime = require('./lib/http').ext2mime,
	apps = Poem.apps,
	conn_id = 0;

var Connection = function(req, res) {
	var c = this;
	// TODO set the encoding based on the header determined encoding
	req.setEncoding('utf8');
	//res.headers["Content-Type"] = "application/xhtml+xml; charset=utf-8";
	//res.statusCode = 500;
	
	c._req = req;
	c._res = res;
	c._sid = null;
	c._ret = 200;
	c._session = null;
	c._input_string = "";
	c._funcs_done = null;
	c._output_string = false;
	c._headers = {
		"Content-Type": "application/xhtml+xml; charset=utf-8"
	};
	
	c._data = {};
	c._func_ret = {};
	c._funcs = {};
	c.request_time = new Date();
	
	c._url = Url.parse(req.url);
	c._get = QueryString.parse(c._url.query);
	//c._sid = new String(req.getCookie("sid")).toString();
	c.id = (conn_id++) + "# " + c._url.pathname;
	
	req.on('end', function(connection) {
		return function() {
			connection.onDataEnd.call(connection);
		}
	}(c)).on('data', function(connection) {
		return function(chunk) {
			connection.onData.call(connection, chunk);
		}
	}(c));
	
	/*
	var Session = global.db.model("Session");
	if(c._sid !== null) {
		// load the session
		if(Session) {
			Session.find(
				  {sid: c._sid} // , d_expires: {$lt: c.request_time}
			).first(function(c) {
				return function(data) {
					//console.log(c.id + ": getting session");
					if(data === null) {
						// create a session
						c._session = new Session();
						c._session.sid = c._sid = LIB.rand_str(26);
						//c._session.d_expires = new Date()
					} else {
						c._session = data;
					}
					
					c.start.call(c);
				};
			}(c));
		}
	}
	*/
	
	return c;
};

Connection.prototype.onData = function(chunk) {
	// do I need a buffer here?
	this._input_string += chunk;
}

Connection.prototype.onDataEnd = function() {
	var c = this;
	
	if(c._input_string.length) {
		c._post = QueryString.parse(c._input_string);
	} else {
		c._post = {};
	}
	
	c.start();
};

Connection.prototype.start = function() {
	var c = this,
		func = c._output_string,
		static_file_url, static_file,
		method = c._req.method;
	
	if(typeof func === 'function') {
		c._output_string = "";
		c._output_string = func(c, c._url.pathname);
	}
	
	if(c._output_string !== false) {
		c.end();
		return;
	}
	
	c._funcs_done = true;
	var path = QueryString.unescape(c._url.pathname);
	if(path === '/') {
		//static_file_url = "/index.html";
		//c._headers["Cache-Control"] = "no-cache, must-revalidate";
		//c._headers["Pragma"] = "no-cache";
		//c._headers["Expires"] = "Fri, 01 Jan 2010 00:00:01 GMT";
		//c._output_string = "<app>a welcoming poem</app>";
		
		c.file("text/html; charset=utf-8", "./public/poem.html");
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
				app.http(c, app_path);
			} catch(e) {
				var msg = e.toString();
				c.print(msg);
				c.end(parseInt(msg, 10) || 500);
			} finally {
				__app = "global";
			}
		} else if(method === "GET") {
			switch(app_name) {
				case "crossdomain.xml":
					//TODO SOME FORM OF SECURITY!!
					// maybe implement this as an application :)
					c._headers["Content-Type"] = "text/xml";
					c._output_string = '<?xml version="1.0"?>'+
								'<cross-domain-policy>'+
									'<site-control permitted-cross-domain-policies="all"/>'+
									'<allow-access-from domain="*"/>'+
									//'<allow-http-request-headers-from domain="*" headers="*"/>'+
								'</cross-domain-policy>';
					c.end();
				break;
				default:
					var public_path = "public/"+app_name;
					fs.stat(public_path, function(err, st) {
						if(err) {
							c._output_string = "404";
							c._headers["Content-Type"] = "text/html";
							c.end(404);
						} else {
							var ext = app_name.substr(public_path.lastIndexOf(".")+1);
							c.file(ext2mime(ext), public_path);
						}						
					});
					/*
					static_file = global.static_files[app_name];

					if(static_file === undefined) {
						c._output_string = "404";
						c._headers["Content-Type"] = "text/html";
						c.end(404);
					} else {
						c._output_string = static_file;
						c._headers["Content-Type"] = static_files_mime[app_name];

						if(typeof static_file === 'function') {
							c._funcs = null;
						} else {
							c.end();
						}
					}
					*/
				break;
			}
		}
	}
};


Connection.prototype.print = function(str) {
	if(this._output_string === false) {
		this._output_string = "";
	}
	 
	this._output_string += str.toString();
};

Connection.prototype.end = function(ret_code) {
	var c = this,
		output_str = c._output_string || "";
	
	// TODO update the expire time in both the session and the cookie 
	//c._res.setCookie("sid", c._sid);
	
	if(output_str.length === 0) {
		var output = {};
		
		if(c._data.length !== 0) {
			output.data = c._data;
		}
		
		if(c._func_ret.length !== 0) {
			output.ret = c._func_ret;
		}
		
		output_str = JSON.stringify(output);
	}
	
	if(typeof ret_code === "undefined") {
		ret_code = c._ret;
	}
	
	c._res.writeHead(ret_code, c._headers); // DEPR
	
	//c._res.shouldKeepAlive = false;
	if(output_str && output_str.length) {
		//c._res.statusCode = 200;
		c._res.write(output_str);
	}
	
	c._res.end();
}

Connection.prototype.file = function(mime, file_path) {
	var c = this;
	c._output_string = false;
	var res = c._res;
	try {
		fs.stat(file_path, function(err, stat) {
			if(err) throw err;
			
			if(stat.isFile()) {      // Stream a single file.
				//c._res.headers['Content-Length'] = stat.size;
				//c._res.headers['Content-Type'] = mime;
				//c._res.statusCode = 200;
				c._headers['Content-Length'] = stat.size;
				c._headers['Content-Type'] = mime;
				res.writeHead(200, c._headers);
				
				(function streamFile(c, buffer, offset) {
					fs.createReadStream(file_path, {
						flags: 'r',
						encoding: 'binary',
						mode: '666',
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
				})(c, new(Buffer)(stat.size), 0);
			} else {
				res.writeHead(404, c._headers);
				res.write("404!");
				res.end(404);
			}
		});
	} catch(e) {
		res.writeHead(500, c._headers);
		res.write(e.message+"\n"+e.stack);
		res.end();
	}
}

exports.Connection = Connection;
