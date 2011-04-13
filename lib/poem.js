"use strict"

//TODO: add a cmd timeout, so that cmds will always return eventually

var Crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var Util = require('util');
var Poem = require("../poem/app-manager");
var Edb = require("lib/edb");


var Cmd = function(app, cmd, params, callback, error) {
	var c = this;
	
	c.app = app;
	c.cmd = cmd;
	c.params = params;
	c.callback = callback;
	c.error = error;
	
	var poem_app = Poem.apps[app];
	if(typeof poem_app !== "object") {
		throw new Error("app ("+app+") is not installed correctly");
	}
	
	if(typeof poem_app.cmds !== "object") {
		throw new Error("app ("+app+") has not exported any cmds");
	}
	
	var cmd_f = poem_app.cmds[cmd];
	if(typeof cmd_f !== 'function') {
		throw new Error("cmd ("+cmd+"): function not defined");
	}
	
	cmd_f(params, callback, error);
	
	return c;
};

var DataStore = function() {
	var DataStore = function(name, params) {
		// this will automatically propagate an event every time that something is added / removed / updated
		// the idea is that, in html we don't need to know about the entire data store...
		// we will always show what we have, then update with the remaining in real time
		// the get params heavily model those of mongodb's query params. this is to allow for flexibility in a system where the only thing passed between the client and server is datas
		// the idea is have data, and then have an index on top of it. this would represent the index on top.
		// the index is going to be publicly accessible data readable by anyone.
		// you will also have the ability to have privately accessible indices as well, which can only be read by certain people.
		// this, however, is a problem for another day, making a linked list of index blocks.
		
		// need html functions to display the DataStore in a table-like format updating it from the server - full with query params and such
		// ohhh this is cool! I see it now. I'm gonna take this step by step...
		// server list -> html list
		//  -> automatic html update of list in real-time
		//  -> automatic add in real-time
		//  -> automatic remove in real-time
		
		// it'd also be good to automatically integrate this into edb so that it's automatically stored on the disk.
		// also, while I'm thinking about it edb needs to become a local unhosted storage node (and probably renamed)
		// we should generage a private key automatically for the user so that this is possible. (and also this means that the person's playbox could be the same everywhere)
		// wait, no... the local storage should have nothing to do with the unhosted storage..
		// unhosted storage should be for things like the playlists and stuff
		// local storage should apply to local directory paths and such
		
		var self = this;
		var prefix = name+".";
		var arr = {};
		
		function hash(id) {
			var h = Crypto.createHash('sha1');
			h.update(id);
			return h.digest('hex');
		}
		
		self.exists = function(id) {
			return id in arr;
		};
		
		self.count = function() {
			var count = 0;
			//TODO: add query parameters
			
			for(var key in arr) if(arr.hasOwnProperty(key)) {
				count++;
			}
			
			return count;
		};
		
		self.add = function(id, data, nosync) {
			if(self.exists(id)) {
				throw new Error("id: '"+id+"' already exists in the data store.");
			} else if(typeof data !== 'object') {
				throw new Error("data is not an object: "+typeof(data));
			}
			
			data._id = id;
			arr[id] = data;
			if(!nosync) {
				Edb.set(name+"."+hash(id), data);
				self.emit("add", data);
			}
			
			return self;
		};
		
		self.update = function(id, data) {
			var d = arr[id];
			if(typeof d !== 'object') {
				throw new Error("id: '"+id+"' doesn't exist in the data store.");
			} else if(typeof data !== 'object') {
				throw new Error("data is not an object");
			}
			
			var updated = Update(d, data);
			if(empty(updated) === false) {
				Edb.set(name+"."+hash(id), d);
				self.emit("update", d);
			}
		};
		
		self.remove = function(id) {
			if(!this.exists(id)) {
				throw new Error("id: '"+id+"' doesn't exist in the data store.");
			}
			
			delete arr[id];
			Edb.rm(name+"."+hash(id));
			self.emit("remove", id);
		};
		
		self.findOne = function(params) {
			if(typeof params !== 'object') {
				params = {};
			}
			
			params["$limit"] = 1;
			var r = this.find(params);
			return r.length ? r[0] : null;
		};
		
		self.forEach = function(func, offset, limit) {
			var ret = [];
			var count = 0;
			
			if(typeof offset === 'undefined') {
				offset = 0;
				limit = 100;
			} else if(typeof limit === 'undefined') {
				limit = offset;
				offset = 0;
			}
			
			for(var key in arr) {
				if(arr.hasOwnProperty(key) && count >= offset && count < limit) {
					var d = func(arr[key]);
					if(d) {
						ret.push(d);
						count++;
					}
				}
			}
			
			return ret;
		};
		
		self.find = function(params) {
			if(!params) params = {};
			var ret = [],
				offset = 0,
				limit = 100,
				count = 0,
				is_empty = empty(params);
			
			if(is_empty === false) {
				if(params["$offset"]) {
					offset = params["$offset"] * 1;
					delete params["$offset"];
				}
				
				if(params["$limit"]) {
					limit = params["$limit"] * 1;
					delete params["$limit"];
				}
				
				is_empty = empty(params);
			}
			
			for(var key in arr) {
				if(arr.hasOwnProperty(key) && count >= offset && count < limit) {
					var record = arr[key];
					if(is_empty === true) {
						ret.push(record);
						count++;
					} else {
						for(var record_key in record) if(record.hasOwnProperty(record_key)) {
							var search_param = params[record_key],
								record_key_value = record[record_key];
							
							if(
								(typeof search_param === 'function' && search_param(record_key_value)) ||
								(record_key_value === search_param) // TODO: need deep search for objs
							) {
								ret.push(record);
								count++;
							}
						}
					}
				}
			}
			
			return ret;
		};
		
		
		Edb.list(prefix, function(key, data) {
			self.add(data._id, data, true);
			self.emit("load", data);
		});
		
		return self;
	};
	
	Util.inherits(DataStore, EventEmitter);
	return DataStore;
}();


exports.Cmd = Cmd;
exports.DataStore = DataStore;
