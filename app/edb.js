
var fs = require('fs');

// "db" shit... (this will be changed for a real one soon... for now it's a chusta)
var edb_dir = false;

exports.init = function(dir, callback) {
	// todo: test dir exists
	
	edb_dir = dir.substr(-1, 1) === "/" ? dir.substr(0, dir.length-1) : dir;
	fs.stat(edb_dir, function(err, s) {
		if(err) {
			// create directory
			fs.mkdir(edb_dir, 0666, function(err) {
				if(err) {
					throw new Exception("error creating edb directory");
				} else if(callback) {
					callback(true);
				}
			});
		} else if(!s.isDirectory()) {
			throw new Exception("initialized edb dir already exists");
		} else if(callback) {
			callback(true);
		}
	});
};


exports.get = function(key, callback) {
	if(edb_dir === false) throw new Exception("edb not initialized");
	fs.readFile(edb_dir + key, function(err, data) {
		var value = err ? undefined : JSON.parse(data);
		if(callback && value !== undefined) {
			callback(key, value.v);
		}
	});
}


exports.set = function(key, value, callback) {
	if(edb_dir === false) throw new Exception("edb not initialized");
	fs.writeFile(edb_dir + key, JSON.stringify({v: value}), function(err, data) {
		if(callback) {
			callback(key, value);
		}
	});
}
