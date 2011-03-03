
playbox preview
===============

licensed under AGPLv3

intro
-----

most of this code is total fumas. It is the goal, over the next few weeks, to make this code look professional. the extreme disorganization was due to many obsoleted ideas in the prototype phase. it took me a while to figure out the exact architecture I wanted. I'm just gonna write random thoughts:

1. I really would like more of an object oriented version, abstracting out the program more and more to js. it will be a gradual change, working to make the code less and less C++ heavy. at first, objects will represent things such as torrents (archives) and dht requests. it is in my best interest to write the majority of this code in js, following the event and callback method of programming common to node js; it is clearly the future. so, I will begin moving large sections of the libtorrent dht stuff out to javascript. it allows me to begin working on the necessary protocol for more complicated tasks.

2. the 'playbox' will become an application to this program in the coming days. the name of this program will be called 'poem'. poem will be a bit of an application server allowing for some programs to do cool shit on your machines. plans are good here. for example, you can find code allowing for the use of libavcodec and libtorrent from javascript. you can see the obvious reason for this. lightweight media servers can be created with the idea of local playback. applications can be created rapidly not needing to know anything more than javascript. later, serving over localhost to the browser, audio, video, etc. can be used. think little media boxes.

3. right now, there is virtually no work done on the network side of things... meaning I am using libtorrent to hash the files and create the torrents. however, the torrents need the dht to begin working. the dht will be used to make to transfer the torrent metadata. it's not really important right now. I need to make a local playbox before we can do same-network transfers between boxes.

4. the reason why I'm changing the name to poem, is because there was an idea of writing a remote control to the playbox and I didn't really want that to be included by default, so I made it possible to have multiple apps running, and services can be provided to others. for example, you make see a new application soon called 'libtorrent' where I begin moving all the work out to the javascript (so it's not blocking) and just running the sha1 functions from javascript as well. I can delete a large part of the library after doing that, creating the entire torrent in javascript. so, 'poem' is the name of the system for maintaining these applications.

5. applications will be able to be downloaded from the internet after I implement some sort of rsa (so harmfull apps would not be installed). also, lots of work will need to be done making the environment safe.

developing..


==========================

(under heavy development; not final at all)


poem
====

poem is a generic application framework to run javascript applications easily.
in its current state of development, it will compile and run on osx and linux.
applications will able to be downloaded over torrent or http.
applications are signed and checked before installing to prevent malicious behaviour
applications will be sandboxed in a new procecss with a restricted namespace
applications can be downloaded, started, stopped, and reloaded at any time
applications will not be able to run each others code, but they will be able to export functions to other applications

<pre>
poem server structure
---------------------

/main.js - starting point of the program. contains all module reloading code
/poem/app-manager.js - contains the code which dynamically loads the "apps" into the server to be run
/poem/cache.js - contains functions used for each app's cache
/poem/edb.js - temporary library until we've got a real data layer
/poem/library.node - contains C++ code to maintain the poem library and cache
/apps/[app] - each application (or poem) which can be loaded by the poem server contains its own directory
/apps/[app]/[app].js - each application contains its own entry point self-named
</pre>

<pre>
application structure
---------------------

each program must export the following:

> init: function({[broadcast: function(msg)], ...}) {...}
> start: function() {...}
> stop: function() {...}
> connect: function(socket) - called on all apps currently loaded when a client connects
> disconnect: function(socket) {...} - called on all apps currently loaded when a client disconnects
> http: function(connection, path) {...} - called each time the application is accessed over http (http://localhost:1155/app/)
> cmds: { [cmd2]: function(params) {...},
>         [cmd1]: function(params) {...} }
</pre>


<pre>
communicating with the server
=============================

poem/RPC-1
----------
format similar to JSON-RPC. it, however accepts a single command, or an array of commands.
commands will be returned to the client as they finish / fail
(meaning that if you send an array of 3 commands, you'll get 3 separate responses)
all fields are required.

> {
>   [`protocol`|`p`] : "poem/RPC-1"
>   [`id`|`i`]       : [string|int]
>   [`app`|`a`]      : [string]
>   [`cmd`|`c`]      : [string]
>   [`params`|`p`]   : [object]
> }

`protocol`
must be "poem/RPC-1", cause that's the only protocol implemented right now.

`id`
this is a unique identifier in which the request id will correspond with the response id, allowing for async messaging.
logic will be added to allow for control flow of the messages

`app`
specifies which application to route the message.

`cmd`
specifies which cmd should be called, exported by the application in the "cmds" object

`params`
params are passed to the cmd function as an object


return format
-------------
commands are returned asynchronously, and not necessarily in the order they were sent. this is why `id` is returned along with the response.
because of this, I'm going to also add cmd timeouts. this could be dangerous though.. thoughts?

> {
>   [`id`]          : [string|int]
>   [`ret`|`error`] : [object]
> }

`id`
id corresponds to the id of the message sent

`ret`
in the case of success, ret will be returned

`error`
if there were any errors encountered, it will not return "ret", instead "error" with the error message.
</pre>


<pre>
application implementation
==========================

applications are loaded in a protected context. this is to try and mitigate the amount of damage that an application can do. in theory, an application can obtain full access to the system however, for now, these will be specially signed applications that come with the system. in the future this may be restricted a bit, but I really don't want 'viruses'

</pre>

<pre>
applist.json
============

this file is simply a list of "applications" that can be loaded into poem. it's simply an object containing a list of CommonJS package formatted objects. each name corresponds to the way it's addressed. each application can be addressed by any of its names (package, package-x, package-x.y, package-x.y.z). the server will just figure out if the application exists or not. dependencies will be resolved in this fashion as well.

for now, this file will be synced from a remote location (TBD), but I expect in the future this to become decentralized a bit.

obviously commonjs notation will be used for the app manager. the interface for this needs work.

[I know that poem / playbox do not yet conform to this specification, but it's in mind... hehe]

</pre>


=============================

DOCS TODO:
document the application creation process
document application permissions
traducir al español (pero ustedes deberian saber algo de ingles, jaja)
