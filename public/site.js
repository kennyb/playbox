


var SKIN = {
	templates: {},
	templates_txt: {},
	get_template : function(tpl, txt) {
		var fn = SKIN.templates[tpl],
			is_panel = 0;
		
		//TODO: perhaps I want to change this to {{variable}} instead of {{{{variable}}}}
		if(typeof fn !== 'function') {
			function arg_vars(str) {
				str = ('"'+LIB.trim(str).replace(/\{\{\{\{(.*?)\}\}\}\}/g, function(nothing, variable) {
					return '",'+variable+',"';
				})+'"').replace(/\{\{(.*?)\}\}/g, function(nothing, variable) {
					return '",L.'+variable+',"';
				});
				
				while(str.substr(0, 1) === ',') {
					str = str.substr(1);
				}
				
				while(str.substr(-1) === ',') {
					str = str.substr(0, str.length-1);
				}
				
				return str;
			}
			
			function concat_vars(str) {
				str = ('"'+LIB.trim(str).replace(/\{\{\{\{(.*?)\}\}\}\}/g, function(nothing, variable) {
					return '"+'+variable+'+"';
				})+'"').replace(/\{\{(.*?)\}\}/g, function(nothing, variable) {
					return '"+L.'+variable+'+"';
				});
				
				while(str.substr(0, 3) === '""+') {
					str = str.substr(3);
				}
				
				while(str.substr(str.length-3) === '+""') {
					str = str.substr(0, str.length-3);
				}
				
				return str;
			}
			
			function concat_scope(scope) {
				var code = "";
				for(var i = 0; i < scope.length; i++) {
					var last_s = scope[i-1] ? scope[i-1]+"" : "";
					var s = scope[i];
					var c1 = s.charAt(0);
					var c2 = last_s.length ? last_s[0].substr(-1) : "";
					code += ((
							!last_s.length ||
							((c1 !== ';' || c1 !== '}') && (c2 === ';' || c2 === '}')) ||
							((c1 === ';' || c1 === '}') && (c2 !== ';' || c2 !== '}'))
						) ? "" : ";") + s;
				}
				
				return code;
			}
			
			function print_scope(code_blocks) {
				var i = 0,
					len = code_blocks.length,
					scope = [],
					node, inner;
				
				for(; i < len; i++) {
					node = code_blocks[i];
					
					if(node.nodeName.toLowerCase() === "code") {
						inner = LIB.trim(node.innerHTML + "")
						scope.push(cE("x", {innerHTML: inner}).firstChild.data);
					} else if(len === 1) {
						return "function(){return " + print_node(node) + "}()";
					} else {
						scope.push("o.push("+print_node(node)+")");
					}
				}
				
				// do the return lengths
				return !len ? "null" :
						"function(){var o=[];" + concat_scope(scope.concat("return o}()"));
			}
			
			function print_node(node) {
				var node_type = node.nodeName.toLowerCase();
				
				if(node_type === "code") {
					console.trace();
				} else if(node_type === "#text") {
					return arg_vars(node.nodeValue);
				} else {
					var i = 0, a, attr, n,
						attrs = [],
						child_funcs = [],
						attributes = node.attributes,
						children = node.childNodes;
						
					for(; i < attributes.length; i++) {
						a = attributes[i];
						attr = a.nodeName.toLowerCase();
						
						if(attr.substr(0, 2) === "on" && a.nodeValue) {
							// for now we'll assume this is an event
							//TODO: if there is no reference to 'd' then we don't need a scope
							// perhaps we can search for it by doing a search for 'd.'
							// but then, what if someone does something like myfunc(d) or myfunc("lala", d)
							// so maybe we could search for 'd.' or 'd)' or 'd,' (that'd probably take care of about 99% of the cases)
							// since it's ridiculous, we're just going to always do a scope... in modern engines, it probably doesn't cost much
							attrs.push(attr+":function(d){return function(){"+a.nodeValue+"}}(d)")
						} else {
							attrs.push(attr+":"+concat_vars(a.nodeValue));
						}
					}
					
					for(i = 0; i < children.length; i++) {
						n = children[i];
						if(n.nodeName.toLowerCase() === "code") {
							a = i;
							i = children.length;
							while(children[--i].nodeName.toLowerCase() !== "code") {}
							var scope = [];
							do {
								scope.push(children[a]);
							} while(a++ !== i);
							
							child_funcs.push(print_scope(scope));
						} else {
							child_funcs.push(print_node(n));
						}
					}
					
					if(child_funcs.length) {
						child_funcs = ','+child_funcs.join(',');
					}
					
					return "cE('"+node_type+"',{"+attrs.join(',')+"}"+child_funcs+")";
				}
			}
			
			// --------------
			
			if(typeof txt === 'undefined') {
				txt = SKIN.templates_txt[tpl];
				if(!txt) {
					return null;
				}
			}
			
			txt = LIB.trim(LIB.str_replace_array(LIB.trim(txt), ["\n", "\t", "  "], ["", "", " "]));
			txt = LIB.trim(txt).replace(/\<\?(.*?)\?\>/g, function(nothing, variable) {
				while(variable.substr(-1, 1) === ';') {
					variable = variable.substr(0, variable.length-1);
				}
				
				var v = cE("div", 0, variable).innerHTML;
				if(v.charAt(0) === '=') {
					return "{{{{"+v.substr(1)+"}}}}";
				} else {
					return "<code>"+v+"</code>";
				}
			});
			
			var div = cE("div", {html: txt}),
				code_blocks = div.childNodes,
				top_level = [],
				i = 0, n;
			
			for(; i < code_blocks.length; i++) {
				n = code_blocks[i];
				top_level.push(print_node(n));
				if(n.nodeName.toLowerCase() === "code") {
					i = code_blocks.length;
					while(code_blocks[--i].nodeName.toLowerCase() !== "code") {}
				}
			}
			
			txt = LIB.str_replace(top_level.join(','), ',""', '');
			if(top_level.length > 1) {
				txt = "["+txt+"]";
			}
			
			//console.log(tpl, "fn::", txt);
			txt = "return "+txt+';';
			try {
				if(is_panel) {
					fn = SKIN.templates[tpl] = new Function("t", "p", "o", txt);
				} else {
					fn = SKIN.templates[tpl] = new Function("t", "d", "o", txt);
				}
			} catch(e) {
				console.log("template error:", e);
			}
			
			//console.log(tpl, " :: ", fn.toString());
		}
		
		return fn;
	},
	data_template : function(template_id, cmd, params, opts) {
		if(typeof opts !== 'object') opts = {};
		
		var id = SERVER.cmd(cmd, params, function(template_id) {
			return function(msg) {
				var els = document.getElementsByClassName("cmd_"+template_id),
					err = msg.error,
					data = msg.ret,
					id = msg.id,
					common = msg.common,
					i = 0, e;
				
				for(; i < els.length; i++) {
					e = els[i];
					
					if(e.i === id) {
						if(err) {
							SKIN.template(template_id, {"$error": err}, e, common);
						} else {
							SKIN.template(template_id, data, e, common);
						}
					}
				}
			};
		}(template_id), opts.app);
		
		if(opts.add) {
			SKIN.subscribe(opts.add, template_id, id, function(data, e) {
				//console.log("add event", template_id, e, data, e);
				if(e.is_empty) {
					e.is_empty = 0;
					e.innerHTML = "";
				}
				
				aC(e, SKIN.template(template_id, data));
			});
		}
		
		if(opts.remove) {
			SKIN.subscribe(opts.remove, template_id, id, function(id, e) {
				//console.log("remove event", template_id, id, e);
				remove_element(e, id);
			});
		}
		
		if(opts.update) {
			SKIN.subscribe(opts.update, template_id, id, function(data, e) {
				//console.log("update event", template_id, data, e);
				SKIN.template(template_id, data, e);
			});
		}
		
		return cE("div", {c: "cmd_"+template_id, i: id}, "Loading...");
	},
	template : function(template_id, data, element, common) {
		var template_func, template, output, error, func_ret, fn_t,
			i, d;
		
		if(typeof data !== 'object') {
			data = {};
		}
		
		if(element) {
			if(element.empty) {
				element.is_empty = 0;
				element.innerHTML = "";
			}
			
			if(data.length === 0) {
				element.is_empty = 1;
			}
		}
		
		if(typeof (error = data["$error"]) !== 'undefined') {
			data = Mixin(data, common);
			output = cE("error", 0, error);
		} else {
			if(data.length == 0 && (typeof(fn_t = SKIN.get_template("empty_"+template_id)) === 'function' || typeof(fn_t = SKIN.get_template("empty")) === 'function')) {
				output = fn_t("empty", data);
			} else if(data.length) {
				output = [];
				//TODO add paging? - lol
				for(i = 0; i < data.length; i++) {
					d = Mixin(data[i], common);
					func_ret = SKIN.template(template_id, d);
					if(typeof(func_ret) !== 'undefined') {
						output.push(func_ret);
					}
				}
			} else if(typeof(fn_t = SKIN.get_template(template_id)) === 'function') {
				output = fn_t(template_id, data);
			} else {
				output = cE("error", 0, "template '"+template_id+"' does not exist");
			}
		}
		
		if(typeof data._id !== 'undefined' && typeof output._id === 'undefined') {
			output._id = data._id;
		}
		
		if(element) {
			var nodes = element.childNodes;
			if(typeof output._id === 'undefined') {
				// replace entire
				element.innerHTML = "";
				aC(element, output);
			} else {
				// individual replace / insert
				replace_element(element, output, 1);
			}
		}
		
		return output; //typeof output !== 'undefined' ? new String(output).toString() : "";
	},
	subscribe : function(event_id, template_id, element_id, callback) {
		SERVER.events[event_id] = function(event_id, template_id, element_id, callback) {
			return function(msg) {
				var els = document.getElementsByClassName("cmd_"+template_id),
					err = msg.error,
					data = msg.data,
					len = els.length,
					i = 0, e;
				
				if(len) {
					for(; i < len; i++) {
						e = els[i];
						
						if(e.i === element_id) {
							if(err) {
								callback({"$error": err}, e);
							} else {
								callback(data, e);
							}
						}
					}
				} else {
					delete SERVER.events[event_id];
				}
			};
		}(event_id, template_id, element_id, callback);
	},
	reloadCurrentPanel : function() {
		STATEMANAGER.hash = null;
	}
};

//---------------------------------------
// move these to real events

var RENDER = {
	
	error: function(element, data) {
		data = data || {};
		console.log(element, data);
		if(data["$error"]) {
			element.appendChild(cE('error', {}, data["$error"]));
			return false;
		}
		
		return true;
	}
};

var UI = {};

var EVENTS = {
	pageLoaded: function() {
		LIB.loadLibs({templates: true});
	},
	onResize: function(e) {
		
	},
	onKeydown: function(e) {
		
	}
};

LIB.addEvent('load', EVENTS.pageLoaded, window);
