

///* DEBUG
function testing(t, d, o) {
	return [
		function(){
			o=[];
			d.d_end = LIB.formatDate(d.d_end);
			d.desc_a = d.desc[0];
			d.desc_b = d.desc[1];
			d.img_a = d.img[0];
			d.img_b = d.img[1]
			return o
		}(),
		cE('h1',{}, d.title ),
		cE('div',{},
			cE('div',{style:"float: left;"},
			cE('input',{type:"button",value:"vote a"}) ),
			cE('div',{style:"float: left;",id:"debate_time_remaining"}, d.d_end ),
			cE('div',{style:"float: left;"},
				cE('input',{type:"button",value:"vote b"})
			)
		),
		cE('div',{},
			cE('div',{style:"float: left;",id:"debate_desc_a"},
				cE('div',{},
					function() {
						var a = [];
						//for(sdsdf)  {
						//	cE('img',{width:"50",height:"50",src:d.img_a})
						return a;
					}()
				),
				cE('div',{}, d.desc_a )
			),
			cE('div',{style:"float: left;",id:"debate_pot"}, "current pot!" ),
			cE('div',{style:"float: left;",id:"debate_desc_b"},
				cE('div',{},
					cE('img',{src:d.img_b})
				),
				cE('div',{}, d.desc_b )
			)
		),
		cE('div',{id:"debate_comments"},
		cE('div',{}, "total: "+d.comments.length ),
			SKIN.template("debate_comments", d.comments)
		)
	];
}
//DEBUG */

var SKIN = {
	templates: {},
	get_template : function(tpl, txt) {
		var fn = SKIN.templates[tpl],
			is_panel = 0;
		
		if(typeof fn !== 'function') {
			function arg_vars(str) {
				str = '"'+LIB.trim(str).replace(/\{\{\{\{(.*?)\}\}\}\}/g, function(nothing, variable) {
					return '",'+variable+',"';
				})+'"';
				
				while(str.substr(0, 1) === ',') {
					str = str.substr(1);
				}
				
				while(str.substr(-1) === ',') {
					str = str.substr(0, str.length-1);
				}
				
				return str;
			}
			
			function concat_vars(str) {
				str = '"'+LIB.trim(str).replace(/\{\{\{\{(.*?)\}\}\}\}/g, function(nothing, variable) {
					return '"+'+variable+'+"';
				})+'"';
				
				while(str.substr(0, 3) === '""+') {
					str = str.substr(3);
				}
				
				while(str.substr(str.length-3) === '+""') {
					str = str.substr(0, str.length-3);
				}
				
				return str;
			}
			
			function print_node(node) {
				var node_type = node.nodeName.toLowerCase();
				
				if(node_type === "code") {
					var scope = [];
					while(true) {
						node_type = node.nodeName.toLowerCase();
						var inner = LIB.trim(node.innerHTML + "");
						if(inner.charAt(inner.length-1) === ';') {
							inner = inner.substr(0, inner.length-1);
						}
						
						if(inner) {
							if(node_type === "code") {
								scope.push(cE("x", {innerHTML: inner}).firstChild.data);
							} else {
								scope.push("\no.push("+print_node(node)+")\n");
							}
						}
						
						if(node.nextSibling) {
							node = node.nextSibling;
						} else {
							// rewind the stack until the last codeblock
							while(node.nodeName.toLowerCase() !== "code") {
								node = node.previousSibling; 
								scope.pop();
							}
							
							break;
						}
					}
					
					return "function(){\nvar o=[];\n"+scope.join('')+";return o}()";
				} else if(node_type === "#text") {
					return arg_vars(node.nodeValue);
				} else {
					var attrs = [];
					var child_funcs = [];
					var attributes = node.attributes;
					var children = node.childNodes;
					for(var i = 0; i < attributes.length; i++) {
						var a = attributes[i];
						attrs.push(a.nodeName.toLowerCase()+":"+concat_vars(a.nodeValue));
					}
					
					for(var i = 0; i < children.length; i++) {
						var n = children[i];
						child_funcs.push(print_node(n));
						if(n.nodeName.toLowerCase() === "code") {
							i = children.length;
							while(children[--i].nodeName.toLowerCase() !== "code") {}
						}
					}
					
					if(child_funcs.length) {
						child_funcs = ',\n\t'+child_funcs.join(',')+"\n";
					}
					
					return "cE('"+node_type+"',{"+attrs.join(',')+"}"+child_funcs+")";
				}
			}
			
			// --------------
			
			if(typeof txt === 'undefined') {
				if(txt = $('template_' + tpl)) {
					txt = txt.textContent;
				} else if(txt = $('panel_' + tpl)) {
					is_panel = 1;
					txt = txt.textContent;
				} else {
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
			
			var div = cE("div", {html: txt});
			var code_blocks = div.childNodes;
			var top_level = [];
			
			for(var i = 0; i < code_blocks.length; i++) {
				var n = code_blocks[i];
				top_level.push(print_node(n));
				if(n.nodeName.toLowerCase() === "code") {
					i = code_blocks.length;
					while(code_blocks[--i].nodeName.toLowerCase() !== "code") {}
				}
			}
			
			txt = top_level.join(',\n');
			if(top_level.length > 1) {
				txt = "["+txt+"]";
			}
			
			txt = "return "+txt+';';
			if(is_panel) {
				fn = SKIN.templates[tpl] = new Function("t", "p", "o", txt);
			} else {
				fn = SKIN.templates[tpl] = new Function("t", "d", "o", txt);
			}
			
			//console.log(tpl, " :: ", fn.toString());
		}
		
		return fn;
	},
	data_template : function(template_id, cmd, params, app) {
		var id = SERVER.cmd(cmd, params, function(template_id) {
			return function(err, data, id) {
				var els = document.getElementsByClassName(template_id);
				for(var i = 0; i < els.length; i++) {
					var e = els[i];
					
					if(e.id == id) {
						if(err) {
							SKIN.template(template_id, {"$error": err}, e);
						} else {
							SKIN.template(template_id, data, e);
						}
					}
				}
			};
		}(template_id), app);
		
		return cE("div", {c: template_id, id: id}, "Loading...");
	},
	template : function(template_id, data, element) {
		var template_func, template, output, error, func_ret, fn_t;
		
		if(data === null) {
			output = cE("error", 0, "data is not reachable");
		} else if(typeof data === 'object' && typeof (error = data["$error"]) !== 'undefined') {
			output = cE("error", 0, error);
		} else if(data instanceof Array && data.length) {
			output = [];
			//TODO add paging? - lol
			for(var i = 0; i < data.length; i++) {
				/*func_ret = function(template_id1, data1) {
					return function() {
						return SKIN.template(template_id1, data1);
					};
				}(template_id, data[i]) ();*/
				func_ret = SKIN.template(template_id, data[i]);
				if(typeof(func_ret) !== 'undefined') {
					output.push(func_ret);
				}
			}
		} else if(typeof(fn_t = SKIN.get_template(template_id)) === 'function') {
			data = data || {};
			output = fn_t(template_id, data);
		} else {
			output = cE("error", 0, "template '"+template_id+"' does not exist");
		}
		
		if(element) {
			element.innerHTML = "";
			aC(element, output);
		}
		
		return output; //typeof output !== 'undefined' ? new String(output).toString() : "";
	},
	render : function(uid) {
		SKIN.template("sidebar", {}, $('sidebar'));
		SKIN.resize();
	},
	parsePanelsLang : function() {
		var	xmps=document.getElementsByTagName("xmp"),
			i, xmp, c, id, e;

		for(i = 0; i < xmps.length; i++) {
			xmp=xmps[i];
			e = xmp.id.indexOf("_noLang");
			if(e !== -1) {
				c = LIB.trim(xmp.innerHTML).replace(/\{\{(.*?)\}\}/g, function(a, b) { return L[b]; });
				id = xmp.id.substr(0, e);
				LIB.removeElement(id);
				e = document.createElement("xmp");
				e.id = id;
				e.textNode = c;
				xmp.parentNode.appendChild(e);
			}
		}
	},
	reloadCurrentPanel : function() {
		STATEMANAGER.hash = null;
	},
	resize : function() {
		// nada
	}
};

//---------------------------------------

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
