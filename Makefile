
NODE = ./node
name = all

all:
	git submodule update --init
	if [ ! -d build ]; \
	then \
		patch -N -p1 -d deps/node < patches/node_compile_fixes.diff && \
		cd deps/node && ./configure && make; \
		node-waf configure; \
	fi
	node-waf build
	
	cd build/release && CWD=`pwd` && node --always_full_compiler main.sjs

configure:
	node-waf configure --without-snapshot

prepare:
	#git submodule update --init --recursive
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
		--disable-x11grab \
		--arch=x86_64 \
		--enable-decoder=mp3,mpeg4,vorbis,ape,flac,aac \
		--enable-parser=mpegaudio,mpegvideo,mpeg4video,aac \
		--enable-demuxer=mp3,aac,ogg,ape,flac,wav \
		--enable-protocol=file \
		--enable-postproc \
		--enable-avfilter \
		--enable-avfilter-lavf \
		--disable-doc \
		--arch=x86_64 \
		--cc=/usr/bin/gcc-4.2 \
		--disable-stripping \
		--enable-debug \
		--prefix="." && make -j3
		
debug: build
	node-waf build -v
	cd build/release && CWD=`pwd` && gdb -args ./node main.js

release_mac:
	# this is total caca...
	# puedes hacer algo un poco mas wapo aqui con otool -L
	cp /opt/local/lib/libssl.1.0.0.dylib build/release/lib/libssl.dylib
	cp /opt/local/lib/libcrypto.1.0.0.dylib build/release/lib/libcrypto.dylib
	cp /opt/local/lib/libz.1.dylib build/release/lib/libz.dylib
	cp /opt/local/lib/libboost_thread-mt.dylib build/release/lib/libboost_thread-mt.dylib
	cp /opt/local/lib/libboost_system-mt.dylib build/release/lib/libboost_system-mt.dylib
	cp /opt/local/lib/libboost_filesystem-mt.dylib build/release/lib/libboost_filesystem-mt.dylib
	
	install_name_tool -change /Users/kennybentley/Projects/playbox/build/default/libtorrent.dylib ./lib/libtorrent.dylib build/release/lib/playbox.node
	
	install_name_tool -change /opt/local/lib/libssl.1.0.0.dylib ./lib/libssl.dylib build/release/node
	install_name_tool -change /opt/local/lib/libcrypto.1.0.0.dylib ./lib/libcrypto.dylib build/release/node
	install_name_tool -change /opt/local/lib/libz.1.dylib ./lib/libz.dylib build/release/node
	
	install_name_tool -change /opt/local/lib/libcrypto.1.0.0.dylib ./lib/libcrypto.dylib build/release/lib/libssl.dylib
	install_name_tool -change /opt/local/lib/libz.1.dylib ./lib/libz.dylib build/release/lib/libssl.dylib
	
	install_name_tool -change /opt/local/lib/libssl.1.0.0.dylib ./lib/libssl.dylib build/release/lib/libcrypto.dylib
	install_name_tool -change /opt/local/lib/libz.1.dylib ./lib/libz.dylib build/release/lib/libcrypto.dylib
	
	install_name_tool -change /opt/local/lib/libboost_thread-mt.dylib ./lib/libboost_thread-mt.dylib build/release/lib/libtorrent.dylib
	install_name_tool -change /opt/local/lib/libboost_system-mt.dylib ./lib/libboost_system-mt.dylib build/release/lib/libtorrent.dylib
	install_name_tool -change /opt/local/lib/libboost_filesystem-mt.dylib ./lib/libboost_filesystem-mt.dylib build/release/lib/libtorrent.dylib
	install_name_tool -change /opt/local/lib/libboost_system-mt.dylib ./lib/libboost_system-mt.dylib build/release/lib/libboost_filesystem-mt.dylib
