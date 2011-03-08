
exports.ext2mime = function(ext) {
	var _ext2mime = {
		"html": "text/html",
		"ico": "image/x-icon",
		"css": "text/css",
		"gif": "image/gif",
		"jpg": "image/jpeg",
		"js": "text/javascript",
		"json": "application/x-json",
		"xml": "text/xml"
	};
	if(ext.charAt(0) === '.') {
		ext = ext.substr(1);
	}
	
	return _ext2mime[ext];
};
