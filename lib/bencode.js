
var assert = require('assert');

assert.equal(bencode(4).toString('utf8'), 'i4e', assert.equal);
assert.equal(bencode(0).toString('utf8'), 'i0e', assert.equal);
assert.equal(bencode(-10).toString('utf8'), 'i-10e', assert.equal);
//assert.equal(bencode(12345678901234567890).toString('utf8'), 'i12345678901234567890e', assert.equal);
assert.equal(bencode('').toString('utf8'), '0:', assert.equal);
assert.equal(bencode('abc').toString('utf8'), '3:abc', assert.equal);
assert.equal(bencode('1234567890').toString('utf8'), '10:1234567890', assert.equal);
assert.equal(bencode('\x001234567890').toString('utf8'), '11:\x001234567890', assert.equal);
assert.equal(bencode([]).toString('utf8'), 'le', assert.equal);
assert.equal(bencode([1, 2, 3]).toString('utf8'), 'li1ei2ei3ee', assert.equal);
assert.equal(bencode([['Alice', 'Bob'], [2, 3]]).toString('utf8'), 'll5:Alice3:Bobeli2ei3eee', assert.equal);
assert.equal(bencode({}).toString('utf8'), 'de', assert.equal);
assert.equal(bencode({'age': 25, 'eyes': 'blue'}).toString('utf8'), 'd3:agei25e4:eyes4:bluee', assert.equal);
assert.equal(bencode({'spam.mp3': {'author': 'Alice', 'length': 100000}}).toString('utf8'), 'd8:spam.mp3d6:author5:Alice6:lengthi100000eee', assert.equal);
assert.equal(bencode(false).toString('utf8'), 'b0', assert.equal);
assert.equal(bencode(true).toString('utf8'), 'b1', assert.equal);
assert.equal(bencode([true, 2]).toString('utf8'), 'lb1i2ee', assert.equal);
assert.equal(bencode([2, false]).toString('utf8'), 'li2eb0e', assert.equal);

assert.equal(bencode('\xf0\xf1lala').toString('utf8'), '6:\xf0\xf1lala', assert.equal);
assert.equal(bencode({'\xf0\xf1am.mp3': {'au\xf0\xf1or': 'Ali\xf0\xf1', 'length': 100000}}).toString('utf8'), 'd8:\xf0\xf1am.mp3d6:au\xf0\xf1or5:Ali\xf0\xf16:lengthi100000eee', assert.equal);

function bencode_val(v) {
	var r;
	switch(typeof v) {
		case "boolean":
			return new Buffer("b"+(v ? 1 : 0));
			
		case "number":
			return new Buffer("i"+parseInt(v, 10)+"e");
			
		case "string":
			return bencode(new Buffer(v.length+":"), new Buffer(v));
			
		case "object":
			var r, k, keys = [];
			if(typeof(v.length) === "number" && (v.length === 0 || typeof(v[v.length-1]) !== "undefined")) {
				// list
				
				r = new Buffer("l");
				for(k = 0; k < v.length; k++) {
					if(v.hasOwnProperty(k)) {
						r = bencode(r, v[k]);
					}
				}
				
				r = bencode(r, new Buffer("e"));
			} else {
				// object
				// code lifted from valderman's bencode library found here:
				// http://weeaboo.se/?p=281
				
				for(k in v) {
					if(v.hasOwnProperty(k)) {
						keys.push(bencode(k.toString()).toString('utf8') + bencode(v[k]).toString('utf8'));
					}
				}
				
				keys.sort();

				r = new Buffer("d");
				for(k = 0; k < keys.length; k++) {
					r = bencode(r, new Buffer(keys[k]));
				}
				
				r = bencode(r, new Buffer("e"));
			}
			
			return r;
	}
	
	return v;
}


function bencode(v1, v2) {
	v1 = Buffer.isBuffer(v1) ? v1 : bencode_val(v1);
	v2 = Buffer.isBuffer(v2) ? v2 : bencode_val(v2);
	var ret;
	
	if(Buffer.isBuffer(v1) && Buffer.isBuffer(v2)) {
		ret = new Buffer(v1.length + v2.length);
		v1.copy(ret);
		v2.copy(ret, v1.length);
	} else if(v1) {
		ret = v1;
	} else if(v2) {
		ret = v2;
	} else {
		ret = new Buffer(0);
	}
	
	return ret;
}

exports.concat = function(v1, v2) {
	return bencode(v1, v2).toString('utf8');
};
exports.encode = function(v) {
	return bencode(v).toString('utf8');
};
