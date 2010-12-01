
NODE = ./node
name = all

all:
	node-waf build
	cd build/release && CWD=`pwd` && ./node main.js

configure:
	node-waf configure
