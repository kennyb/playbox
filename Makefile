
NODE = ./node
name = all

all:
	git submodule update --init
	if [ ! -d build ]; \
	then \
		node-waf configure; \
	fi
	node-waf build -v || (node-waf configure && node-waf build)
	cd build/release && CWD=`pwd` && ./node main.js

prepare:
	git submodule update --init --recursive
	if [ ! -d deps/ffmpeg/libswscale ]; \
	then \
		git clone git://gitorious.org/libswscale/mainline.git deps/ffmpeg/libswscale; \
	fi
	cd deps/ffmpeg && ./configure \
	--disable-static \
	--enable-shared \
	--enable-gpl \
	--enable-version3 \
	--enable-pthreads \
	--enable-pic \
	--enable-small \
	--enable-runtime-cpudetect \
	--disable-everything \
	--disable-network \
	--arch=x86_64 \
	--enable-decoder=mp3,mpeg4,vorbis,ape,flac,aac \
	--enable-parser=mpegaudio,aac,ac3,h261,h262,h263 \
	--enable-protocol=file \
	--disable-doc \
	--arch=x86_64 \
	--disable-stripping \
	--enable-debug \
	--prefix="." && make -j2

debug: build
	node-waf build -v
	cd build/release && CWD=`pwd` && gdb -args ./node main.js