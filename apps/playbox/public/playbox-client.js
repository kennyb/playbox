

function play_song(id) {
	$('#jplayer_1').jPlayer('setMedia', {mp3: 'http://localhost:1155/playbox/g/'+id}).jPlayer('play')
}

function dir_item(e, root) {
	var sibling = e.nextSibling;
	if(sibling) {
		if(toggle(sibling)) {
			e.firstChild.innerHTML = '-';
		} else {
			e.firstChild.innerHTML = '+';
		}
	} else {
		e.parentNode.appendChild(SKIN.data_template("dir_entry", "list_dir", {root: root}));
		e.firstChild.innerHTML = '-';
	}
}
