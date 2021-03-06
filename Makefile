
NODE = ./node
name = all

all:
	git submodule update --init || git submodule sync && git submodule update --init --recursive
	# configure
	if [ ! -f build/config.log ]; \
	then \
		node-waf configure; \
	fi
	
	# build node
	if [ ! -f deps/node/build/default/node ]; \
	then \
		patch -N -p1 -d deps/node < patches/node_compile_fixes.diff; \
		cd deps/node && ./configure --without-snapshot --without-ssl && make; \
	fi
	
	# copy node
	if [ ! -f build/release/node ]; \
	then \
		mkdir -p build/release; \
		cp deps/node/build/default/node build/release/node; \
	fi
	
	# configure libav
	if [ ! -f deps/libav/libavformat/libavformat.ver ]; \
	then \
		cd deps/libav && ./configure \
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
			--disable-doc \
			--disable-ffmpeg \
			--disable-ffplay \
			--disable-ffprobe \
			--arch=x86_64 \
			--enable-debug \
			--disable-symver \
			--prefix="." && \
		make -j2; \
	fi
	
	# prepare libav
	node build.js --prepare-libav
	
	# build libtorrent
	node-waf build --targets=torrent
	node build.js --prepare-libtorrent
	
	# build playbox
	node-waf build --targets=playbox
	node build.js --prepare-playbox
	
	
	node build.js --make-release
	
	cd build/release && CWD=`pwd` && node --debug --always_full_compiler main.js
		
debug: build
	node-waf build -v
	cd build/release && CWD=`pwd` && gdb -args ./node main.js

release_mac:
	# this is total caca...
	# build custom openssl (cause osx doesn't ship with it for some reason)
	if [ ! -f deps/openssl-1.0.0d/libssl.dylib ]; \
	then \
		curl "http://www.openssl.org/source/openssl-1.0.0d.tar.gz" | tar xzv -C deps; \
		cd deps/openssl-1.0.0d && make clean && \
		./Configure darwin64-x86_64-cc shared zlib-dynamic && make; \
	fi
	
	# puedes hacer algo un poco mas wapo aqui con otool -L
	cp deps/openssl-1.0.0d/libssl.dylib build/release/lib/libssl.dylib
	cp deps/openssl-1.0.0d/libcrypto.dylib build/release/lib/libcrypto.dylib
	cp /opt/local/lib/libz.1.dylib build/release/lib/libz.dylib
	cp /opt/local/lib/libboost_thread-mt.dylib build/release/lib/libboost_thread-mt.dylib
	cp /opt/local/lib/libboost_system-mt.dylib build/release/lib/libboost_system-mt.dylib
	cp /opt/local/lib/libboost_filesystem-mt.dylib build/release/lib/libboost_filesystem-mt.dylib
	
	install_name_tool -change /Users/kennybentley/Projects/playbox/build/default/libtorrent.dylib ./lib/libtorrent.dylib build/release/lib/playbox.node
	
	install_name_tool -change /opt/local/lib/libssl.1.0.0.dylib ./lib/libssl.dylib build/release/node
	install_name_tool -change /opt/local/lib/libcrypto.1.0.0.dylib ./lib/libcrypto.dylib build/release/node
	install_name_tool -change /opt/local/lib/libz.1.dylib ./lib/libz.dylib build/release/node
	
	install_name_tool -change /usr/local/ssl/lib/libcrypto.1.0.0.dylib ./lib/libcrypto.dylib build/release/lib/libssl.dylib
	install_name_tool -change /opt/local/lib/libz.1.dylib ./lib/libz.dylib build/release/lib/libssl.dylib
	
	install_name_tool -change /opt/local/lib/libssl.1.0.0.dylib ./lib/libssl.dylib build/release/lib/libcrypto.dylib
	install_name_tool -change /opt/local/lib/libz.1.dylib ./lib/libz.dylib build/release/lib/libcrypto.dylib
	
	install_name_tool -change /opt/local/lib/libboost_thread-mt.dylib ./lib/libboost_thread-mt.dylib build/release/lib/libtorrent.dylib
	install_name_tool -change /opt/local/lib/libboost_system-mt.dylib ./lib/libboost_system-mt.dylib build/release/lib/libtorrent.dylib
	install_name_tool -change /opt/local/lib/libboost_filesystem-mt.dylib ./lib/libboost_filesystem-mt.dylib build/release/lib/libtorrent.dylib
	install_name_tool -change /opt/local/lib/libboost_system-mt.dylib ./lib/libboost_system-mt.dylib build/release/lib/libboost_filesystem-mt.dylib
