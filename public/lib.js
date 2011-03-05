// generic lib file

function $(i) {
	return document.getElementById(i);
}

function display(elem, show) {
	if(!elem.style) {
		elem = $(elem);
	}
	
	elem.style.display = show ? '' : 'none';
	return show;
}

function aC(e, value) {
	try {
		if(value.constructor.toString().indexOf("Array") !== -1) {
			for(var i = 0; i < value.length; i++) {
				aC(e, value[i]);
			}
			
			/*var i = value.length-1;
			if(i >= 0) {
				do {
					aC(e, value[i]);
				} while(i--);
			}*/
		} else if(typeof value !== "object") {
			e.appendChild(document.createTextNode(value));
		} else {
			e.appendChild(typeof value._element === "object" ? value._element : value);
		}
	} catch(exception) {
		console.trace();
		console.log(exception);
	}
}

function cE(type, opts) {
	type = type === 1 ? "DIV" :
		type === 2 ? "SPAN" :
		type === 3 ? "TR" :
		type === 4 ? "TD" :
		type === 5 ? "P" :
		type === 6 ? "A" :
		type === 7 ? "B" :
		type === 8 ? "UL" :
		type === 9 ? "LI" :
		type === 10 ? "TABLE" :
		type === 11 ? "TBODY" :
		type;
	
	var	e = document.createElement(type),
		len = arguments.length,
		field, value;
	
	if(opts) {
		if(opts.hide) {
			e.style.display = 'none';
		}
		
		for(field in opts) {
			value = opts[field];
			
			if(value !== '') {
				switch(field) {
				case 'html':
					field = "innerHTML";
					break;
				case 'text':
				case 'T':
					gL(e, value);
					continue;
				case 'style':
					e.style.cssText = value;
					continue;
				case 'e': continue;
				case 'c':
					e.className = value;
					continue;
				case 'h':
					e.style.height = value;
					continue;
				case 'w':
					e.style.width = value;
					continue;
				case 't_px':
					e.style.top = value;
					continue;
				case 'l_px':
					e.style.left = value;
					continue;
				case 'display':
					e.style.display = value || 'none';
					continue;
				case 'cursor':
					e.style.cursor = value;
					continue;
				case 'position':
					e.style.position = value;
					continue;
				case 'f':
					e.htmlFor = value;
					continue;
				default:
				}
				
				e[field] = value;
			}
		}
	}
	
	for(field = 2; field < len; field++) {
		value = arguments[field];
		if(typeof value !== 'undefined') {
			aC(e, value);
		}
	}
	
	return e;
}


// this function is nice, because it will ensure that IE will garbage collect any references to this element.
// I think this may break firefox though, with innerHTML things... (not sure though)
function discard(element) {
	var garbageBin = $('IEsucks');
	if(!garbageBin) {
		garbageBin = document.createElement('DIV');
		garbageBin.id = 'IEsucks';
		garbageBin.style.display = 'none';
		document.body.appendChild(garbageBin);
	}

	garbageBin.appendChild(element);
	garbageBin.innerHTML = '';
}


function show(id, st) {
	if(!st) {
		st = '';
	}
	
	var elem = id.style ? id : $(id);
	if(elem) {
		elem.style.display = st;
	}
}

function hide(id) {
	var elem = id.style ? id : $(id);
	if(elem) {
		elem.style.display = 'none';
	}
}

function swap(id1, id2, st) {
	hide(id1);
	show(id2, st);
}

function toggle(id, st) {
	var elem = id.style ? id : $(id);
	if(elem) {
		if(elem.style.display === 'none') {
			if(!st) {
				st = 'block';
			}
			
			elem.style.display = st;
		} else {
			elem.style.display = 'none';
		}
	}
}

// ---------------

SERVER = {
	msg_id: 1,
	socket: null,
	callbacks: {},
	connect: function() {
		SERVER.socket = new io.Socket();
		SERVER.socket.connect();
		SERVER.socket.on('connect', function() {
			console.log("connected");
		});
		
		SERVER.socket.on('message', function(d) {
			console.log("message", d);
			var c = SERVER.callbacks[d.id];
			c && c(d.error, d.ret, d.id);
		});
		
		SERVER.socket.on('disconnect', function(){
			console.log("disconnected");
		});
	},
	cmd: function(cmd, params, callback, app) {
		var id = SERVER.msg_id++;
		SERVER.callbacks[id] = callback;
		SERVER.socket.send({
			x: "poem/RPC-1", // protocol
			i: id,			// id
			c: cmd,			// cmd
			p: params || {},	// params
			a: app || $app		// application
		});
		
		return id;
	}
},

STATEMANAGER = {
	start: function() {
		clearInterval(STATEMANAGER.timer);
		STATEMANAGER.timer = setInterval(function() { STATEMANAGER.check() }, 50);
	},
	check: function(e) {
		var	h = document.location.hash,
			panel = h.substr(2),
			hasparams = panel.indexOf('/'),
			params = [];
		
		if(h != STATEMANAGER.hash) {
			if(hasparams !== -1) {
				params = LIB.formatParams(panel.substr(hasparams + 1).split('/'));
				panel = panel.substr(0, hasparams);
				h = '#/' + panel + '/' + params.join('/');
				document.location.hash = h;
			}
			STATEMANAGER.hash = h;
			STATEMANAGER.loadPanel(panel, params);
		}
	},
	loadPanel : function(panel, params) {
		if(EVENTS.onUnloadPanel) {
			EVENTS.onUnloadPanel();
			EVENTS.onUnloadPanel = null;
		}
		
		if(panel) {
			var intercept = STATEMANAGER.intercept[panel];
			if(intercept) {
				intercept(params);
			} else {
				SKIN.template(panel, params, $('content'));
			}
		} else {
			document.location.hash = '#/home';
			STATEMANAGER.hash = null;
		}
	},
	intercept: {},
	hash: null,
	timer: 0
},

LIB = {
	loadedLibs : {
		templates : null,
		google : null,
		swfPlayer : null,
		AC_OETags : null,
		md5 : null,
		lang : null
	},
	loadLibs : function(libs) {
		for(var i in libs) {
			if(libs[i]) {
				LIB.loadedLibs[i] = false;
				switch(i) {
					case 'templates':
						i = document.createElement("iframe");
						i.id = 'templates_iframe';
						i.width = i.height = 0;
						i.src = '/'+$app+'/templates.html?';// + DATA.staticVersions['templates.html'];
						document.getElementsByTagName("body")[0].appendChild(i);
					break;
				}
			}
		}
		
		LIB.loadedLib({});
	},
		
	loadedLib : function(lib) {
		var allDone = true,
			/*l = $('loading'),*/
			h = 9.8,
			p = 14.25,
			i;
		
		for(i in lib) {
			LIB.loadedLibs[i] = lib[i];
			switch(i) {
				case 'templates':
					console.log("templates loaded");
					setTimeout("LIB.removeElement('templates_iframe')", 0);
					LIB.loadedLibs.templates = true;
				break;
			}
		}
		
		for(i in LIB.loadedLibs) {
			if(LIB.loadedLibs[i] === false) {
				console.log("no loaded lib: ", i);
				allDone = false;
			} else {
				h += 9.8;
				p += 14.25;
			}
		}
		
		/*
		l.firstChild.style.height = (69 - h) + 'px';
		l.firstChild.nextSibling.style.height = h + 'px';
		l.lastChild.innerHTML = (allDone ? '100' : '&nbsp; ' + Math.round(p)) + '%';
		*/
		
		if(allDone) {
			LIB.allLibsLoaded();
		}
	},
	allLibsLoaded : function() {
		console.log('All libs loaded');
		SKIN.parsePanelsLang();
		//document.body.innerHTML = "";
		//aC(document.body, SKIN.inline_template("loading"));
		
		SKIN.render();
		STATEMANAGER.start();
		LIB.addEvent('resize', EVENTS.onResize, window);
		LIB.addEvent('keydown', EVENTS.onKeydown, window);
	},
	addEvent : function(event, func, element) {
		if(element.addEventListener) {
			element.addEventListener(event, func, false);
		} else {
			element.attachEvent("on" + event, func);
		}
	},
	removeElement : function(e, fade, callback) {
		if(!e.style) {
			e = $(e);
		}
		
		if(e) {
			if(fade) {
				EFFECTS.fadeOut(e, function(e, c) { return function() { LIB.removeElement(e); if(c){ c() } } }(e, callback));
			} else if(e.parentNode) {
				e.parentNode.removeChild(e);
			}
		}
	},
	str_replace : function(string, find, replace) {
		var	i = string.indexOf(find),
			inc = replace.indexOf(find),
			len;

		if(i !== -1) {
			inc = inc === -1 ? 0 : inc+1;
			len = find.length;
			do {
				string = string.substr(0, i) + replace + string.substr(i + len);

				i = string.indexOf(find, i + inc);
			} while(i !== -1);
		}

		return string;
	},
	str_replace_array : function(string, find, replace) {
		for(var i = find.length - 1; i >= 0; --i) {
			string = LIB.str_replace(string, find[i], replace[i]);
		}

		return string;
	},
	trim : function(string) {
		if(typeof string.trim === 'function') {
			// support in firefox 3.5 for this
			string = string.trim();
		} else {
			string = string.replace(/^\s\s*/, '');
			var ws = /\s/,
				i = string.length;
			while (ws.test(string.charAt(--i)));
			return string.slice(0, i + 1);
		}

		return string;
	},
	strip_accents : function(str) {
		var	accents = [
				"á","à","ä","â","ã","å","ą",
				"é","è","ë","ê",
				"í","ì","ï","î",
				"ó","ò","ö","ô","ø",
				"ú","ù","ü","û",
				"ñ","ç",
				"ß","œ","æ"
			],
			noaccents = [
				"a","a","a","a","a","a","a",
				"e","e","e","e",
				"i","i","i","i",
				"o","o","o","o","o",
				"u","u","u","u",
				"n","c",
				"ss","oe","ae"
			];

		return LIB.str_replace_array(str, accents, noaccents);
	},
	formatParams : function(params) {
		var i;
		for(i = 0; i < params.length; i++) {
			params[i] = LIB.formatParam(params[i]);
		}	
			
		return params;
	},
	formatParam : function(param, leaveSpaces) {
		var	badchars = [
				"_","/","'",'"',"&","#", "!", "(", ")"
			],
			replaces = [
				" ","","","","","","","",""
			];
			
		if(!leaveSpaces) {
			badchars.unshift(" ");
			replaces.unshift("_");
		}
	
		return LIB.str_replace_array(LIB.trim(LIB.strip_accents(param)), badchars, replaces);
	},
	formatDate : function(date) {
		var	diff = Math.round((new Date().getTime() - new Date(date).getTime()) / 1000),
			future;

		if(diff < 0) {
			future = 1;
			diff = -diff;
		}
			
		if(diff > 3600*24*60) {
			diff = "months";
		} else if(diff > 3600*24*30) {
			diff = "about a month";
		} else if(diff > 3600*24) {
			diff = Math.floor(diff/3600/24);
			diff = diff > 1 ? diff+" days" : "day";
		} else if(diff > 3600) {
			diff = Math.floor(diff/3600);
			diff = diff > 1 ? diff+" hours" : "hour";
		} else if(diff > 60) {
			diff = Math.floor(diff/60);
			diff = diff > 1 ? diff+" minutes" : "minute";
		} else {
			diff = "seconds";
		}

		return diff + (future ? " from now" : " ago");
	}
};

/*
function textbox(opts) {
	var txt = typeof opts.name === 'undefined' ? "<error>you must have a name for your textbox</error>" : "";
	var _type = opts.type || "text";
	var _active_class = opts.active_class || "form-active";
	var _inactive_class = opts.inactive_class || "form";
	var _class = opts["class"] || "form";
	var _focus_class = opts.focus_class || _active_class;
	var _default_text = opts.default_text;
	
	
	var _value = opts.value || '';
	txt += '<div style="display:none" id="d_'+name+'">'+default_text+'</div><input type="'+type+
			'" class="'+(value ? active_class : inactive_class)+'" name="'+;
	
}
*/

// ==================
// generic functions and object extensions
// ==================

function foreach_safe(array, callback) {
	if(typeof array === 'object') {
		if(array.foreach) {
			return array.foreach(callback);
		} else {
			var a = [], i;
			for(i in array) if(array.hasOwnProperty(i)) {
				a.push(callback(array[i], i));
			}
			
			return a;
		}
	} else if(typeof array !== 'undefined') {
		return callback(array);
	}
}

function keys(obj) {
	var k = [];
	for(var i in obj) {
		if(obj.hasOwnProperty(i)) {
			k.push(i);
		}
	}
	
	return k;
}

function values(obj) {
	var k = [];
	for(var i in obj) {
		if(obj.hasOwnProperty(i)) {
			k.push(obj[i]);
		}
	}
	
	return k;
}

/*
// this is sorta foreach_reverse -- are you sure you want it this way? -- technically, it should be able to do this in multiple threads, but yea...
Array.prototype.foreach = function(callback) {
	var out = new Array(this.length);
	
	var i = this.length-1;
	if(i >=0) {
		do {
			out[i] = callback(this[i], i);
		} while(i--);
	}
	
	return out;
}

Array.prototype.none = function(callback) {
	if(this.length === 0) {
		callback();
	}
	
	return this;
}
*/

Array.prototype.first = function(callback) {
	if(this.length) {
		callback(this[0], 0, this.length);
	}
	
	return this;
}

Array.prototype.last = function(callback) {
	if(this.length) {
		var i = this.length-1;
		callback(this[i], i, this.length);
	}
	
	return this;
}

Array.prototype.middle = function(callback) {
	for(var i = 0, len = this.length-1; i < len; ++i) {
		callback(this[i], i, this.length);
	}
	
	return this;
}

