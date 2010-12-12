
NODE = ./node
name = all

all:
	node-waf build || (node-waf configure && node-waf build)
	cd build/release && CWD=`pwd` && ./node main.js


prepare:
	git submodule update --init
	cd deps/ffmpeg && ./configure --disable-static --enable-shared --enable-gpl --enable-version3 --enable-pthreads --enable-small --enable-runtime-cpudetect --disable-everything --enable-pic --disable-network --disable-debug --disable-swscale --arch=x86_64 --disable-ffprobe --enable-decoder=mp3 --enable-parser=mpegaudio && make -j2

