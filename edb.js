"use strict";

var Fs = require('fs');

// "db" shit... (this will be changed for a real one soon... for now es una chusta)
var edb_dir = false;
// backlog

var queue = [];

function update() {
	if(queue.length) {
		var op;
		while(op = queue.shift()) {
			var key = op[1];
			var callback = op[2];
			
			switch(op[0]) {
				case "set":
					var value = op[3];
					Fs.writeFile(edb_dir + '/' + key, JSON.stringify({v: value}), function(callback, value) {
						return function(err) {
							if(callback) {
								callback(err, value);
							} else if(err) {
								throw err;
							}
						};
					}(callback, value));
					
					break;
				
				case "rm":
					Fs.unlink(edb_dir + '/' + key, function(callback) {
						return function(err) {
							if(callback) {
								callback(err);
							} else if(err) {
								throw err;
							}
						};
					}(callback));
					
					break;
			}
		}
	}
}

exports.init = function(dir, callback) {
	// todo: test dir exists
	
	edb_dir = dir.substr(-1, 1) === "/" ? dir.substr(0, dir.length-1) : dir;
	Fs.stat(edb_dir, function(err, st) {
		if(err && err.code === 'ENOENT') {
			// create directory
			Fs.mkdir(edb_dir, '777', function(err) {
				setInterval(update, 100);
				if(callback) {
					callback(err, st);
				}
			});
		} else if(!st.isDirectory()) {
			callback(new Error("initialized edb dir already exists"));
		} else {
			setInterval(update, 100);
			if(callback) {
				callback(err, st);
			}
		}
	});
};


exports.get = function(key, callback) {
	if(edb_dir === false) throw new Error("edb not initialized");
	
	if(queue.length) {
		update();
	}
	
	Fs.readFile(edb_dir + '/' + key, function(err, data) {
		var value;
		try {
			value = err ? undefined : JSON.parse(data);
		} catch(e) {
			console.log("error decoding value for key: "+key);
			value = undefined;
		}
		
		if(callback) {
			if(value !== undefined) {
				value = value.v;
			}
			
			callback(key, value, err);
		} else if(err) {
			throw err;
		}
	});
};

exports.set = function(key, value, callback) {
	queue.push(["set", key, callback, value]);
};

exports.rm = function(key, callback) {
	queue.push(["rm", key, callback]);
};

exports.list = function(prefix, callback) {
	if(edb_dir === false) throw new Error("edb not initialized");
	
	var prefix_len = typeof prefix === "string" ? prefix.length : 0;
	Fs.readdir(edb_dir, function(err, files) {
		if(err) throw err;
		var i = files.length-1;
		if(i >= 0) {
			do {
				var file = files[i].toString();
				if(prefix_len === 0 || file.substr(0, prefix_len) === prefix) {
					exports.get(file, callback);
				}
			} while(i--);
		}
	});
};
