var $app = "playbox";

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

$(document).ready(function(){
	SERVER.connect();
	$("#jplayer_1").jPlayer({
		ready: function() {
			/*$(this).jPlayer("setMedia", {
				mp3: "http://localhost:1155/playbox/g/68fd78fc9b89542081a89ef9f03ae6ef253879ae",
			});*/
		},
		progress: function(e) {
			console.log("progress", e);
		},
		ended: function(e) {
			console.log("ended", e);
		},
		play: function(e) {
			console.log("play", e);
		},
		pause: function(e) {
			console.log("pause", e);
		},
		seeking: function(e) {
			console.log("seeking", e);
		},
		seeked: function(e) {
			console.log("seeked", e);
		},
		timeupdate: function(e) {
			console.log("timeupdate", e);
			// e.jPlayer.status.currentTime
			// e.jPlayer.status.duration
			$_('song_time').innerHTML = $.jPlayer.convertTime(e.jPlayer.status.currentTime) + " / " + $.jPlayer.convertTime(e.jPlayer.status.duration);
		},
		swfPath: "/jPlayer",
		supplied: "mp3"
	});
	
	//document.documentElement.style.display = "";
});

function add_dir(path) {
	var id = SERVER.cmd("add_dir", {_id: path}, function(msg) {
		console.log("add_dir response", msg);
	});
}

function rm_dir(path) {
	var id = SERVER.cmd("rm_dir", {_id: path}, function(msg) {
		console.log("rm_dir response", msg);
	});
}

SERVER.events["connected"] = function() {
	console.log("connected");
	$_('connected').innerHTML = "connected";
};

SERVER.events["disconnected"] = function() {
	console.log("disconnected");
	$_('connected').innerHTML = "disconnected";
};
