var fs = require('fs');

// "db" shit... (this will be changed for a real one soon... for now it's a chusta)
var edb_dir = false;

exports.init = function(dir, callback) {
	// todo: test dir exists
	
	edb_dir = dir.substr(-1, 1) === "/" ? dir.substr(0, dir.length-1) : dir;
	fs.stat(edb_dir, function(err, s) {
		if(err) {
			// create directory
			fs.mkdir(edb_dir, '777', function(err) {
				if(callback) {
					callback(err);
				}
			});
		} else if(!s.isDirectory()) {
			callback(new Error("initialized edb dir already exists"));
		} else {
			if(callback) {
				callback(err);
			}
		}
	});
};


exports.get = function(key, callback) {
	if(edb_dir === false) throw new Error("edb not initialized");
	fs.readFile(edb_dir + '/' + key, function(err, data) {
		var value;
		try {
			value = err ? undefined : JSON.parse(data);
		} catch(e) {
			value = undefined;
		}
		
		if(callback) {
			if(value !== undefined) {
				value = value.v;
			}
			
			callback(key, value, err);
		}
	});
};

exports.set = function(key, value, callback) {
	if(edb_dir === false) throw new Error("edb not initialized");
	fs.writeFile(edb_dir + '/' + key, JSON.stringify({v: value}), function(err, data) {
		if(callback) {
			callback(key, value, err);
		}
	});
};

exports.rm = function(key, callback) {
	if(edb_dir === false) throw new Error("edb not initialized");
	fs.unlink(edb_dir + '/' + key, function(err, data) {
		if(callback) {
			callback(err);
		}
	});
};

exports.list = function(prefix, callback) {
	if(edb_dir === false) throw new Error("edb not initialized");
	var prefix_len = typeof prefix === "string" ? prefix.length : 0;
	
	fs.readdir(edb_dir, function(err, files) {
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
