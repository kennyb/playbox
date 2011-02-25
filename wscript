#!/usr/bin/env python

import Options
import sys
from os import unlink, symlink, popen, environ, makedirs
from os.path import exists, lexists, abspath
from shutil import copy2, copytree

srcdir = "."
top = "release"
blddir = "build"
APPNAME = "playbox"
VERSION = "1.01"

def canonical_cpu_type(arch):
	m = {'x86': 'ia32', 'i386':'ia32', 'x86_64':'x64', 'amd64':'x64'}
	if arch in m: arch = m[arch]
	if not arch in supported_archs:
		raise Exception("supported architectures are "+', '.join(supported_archs)+\
										" but NOT '" + arch + "'.")
	return arch


def set_options(opt):
	opt.tool_options("compiler_cc")
	opt.tool_options("compiler_cxx")
	opt.add_option( '--debug'
								, action='store_true'
								, default=False
								, help='Build debug variant [Default: False]'
								, dest='debug'
								)	

def configure(conf):
	if 'DEST_CPU' in environ and environ['DEST_CPU']:
		conf.env['DEST_CPU'] = canonical_cpu_type(os.environ['DEST_CPU'])
	elif 'DEST_CPU' in conf.env and conf.env['DEST_CPU']:
		conf.env['DEST_CPU'] = canonical_cpu_type(conf.env['DEST_CPU'])
	
	conf.check_tool("compiler_cc")
	conf.check_tool("compiler_cxx")
	conf.check_tool("node_addon")
	#conf.env.append_value('CXXFLAGS', ['-DDEBUG', '-g', '-O0'])
	#conf.env.append_value('CXXFLAGS', ['-Wall', '-Wextra'])
	conf.env.append_value('CFLAGS', ['-Os', '-ffunction-sections', '-fdata-sections', '-fPIC']) #, '-fdata-sections'
	conf.env.append_value('CXXFLAGS', ['-Os', '-ffunction-sections', '-fdata-sections', '-fno-rtti']) #, '-fno-rtti'
	
	
	if sys.platform.startswith("darwin"):
		conf.env.append_value('LINKFLAGS', ['-Wl,-dead_strip'])
		conf.env.append_value('LINKFLAGS', ['-Wl,-bind_at_load'])
	elif sys.platform.startswith("linux"):
		conf.env.append_value('LINKFLAGS', ['-Wl,--gc-sections'])
	
	conf.check(lib="iconv",
						includes=['/opt/local/include', '/usr/include', '/usr/local/include'],
						libpath=['/opt/local/lib', '/usr/lib', '/usr/local/lib'],
						header_name='iconv.h',
						uselib_store="ICONV")
	conf.check(lib="z",
						includes=['/usr/include', '/usr/local/include', '/opt/local/include'],
						libpath=['/usr/lib', '/usr/local/lib', '/opt/local/lib'],
						uselib_store="ZLIB")
	conf.check(lib="boost_system-mt",
						includes=['/usr/include', '/usr/local/include', '/opt/local/include'],
						libpath=['/usr/lib', '/usr/local/lib', '/opt/local/lib'],
						uselib_store="BOOST_SYSTEM")
	conf.check(lib="boost_iostreams-mt",
						includes=['/usr/include', '/usr/local/include', '/opt/local/include'],
						libpath=['/usr/lib', '/usr/local/lib', '/opt/local/lib'],
						uselib_store="BOOST_IOSTREAMS")
	conf.check(lib="boost_date_time-mt",
						includes=['/usr/include', '/usr/local/include', '/opt/local/include'],
						libpath=['/usr/lib', '/usr/local/lib', '/opt/local/lib'],
						uselib_store="BOOST_DATE_TIME")
	conf.check(lib="boost_thread-mt",
						includes=['/usr/include', '/usr/local/include', '/opt/local/include'],
						libpath=['/usr/lib', '/usr/local/lib', '/opt/local/lib'],
						uselib_store="BOOST_THREAD")
	conf.check(lib="boost_filesystem-mt",
						includes=['/usr/include', '/usr/local/include', '/opt/local/include'],
						libpath=['/usr/lib', '/usr/local/lib', '/opt/local/lib'],
						uselib_store="BOOST_FILESYSTEM")
	
	conf.define("HAVE_CONFIG_H", 1)

	if sys.platform.startswith("sunos"):
		conf.env.append_value ('CCFLAGS', '-threads')
		conf.env.append_value ('CXXFLAGS', '-threads')
		#conf.env.append_value ('LINKFLAGS', ' -threads')
	elif not sys.platform.startswith("cygwin"):
		conf.env.append_value ('CCFLAGS', '-pthread')
		conf.env.append_value ('CXXFLAGS', '-pthread')
		conf.env.append_value ('LINKFLAGS', '-pthread')

	# conf.check(lib='node', libpath=['/usr/lib', '/usr/local/lib'], uselib_store='NODE')


def build(bld):
	bld.add_group('libs')
	#build_id3(bld)
	build_libtorrent(bld)
	
	bld.add_group('libs_built')
	install_libs(bld)
	
	bld.add_group('playbox')
	build_playbox(bld)
	
def build_playbox(bld):
	playbox = bld.new_task_gen("cxx", "shlib", "node_addon", install_path=None)
	playbox.name = "playbox"
	playbox.target = "playbox"
	if sys.platform.startswith("darwin"):
		playbox.linkflags = ['./lib/libavformat.dylib', './lib/libtorrent.dylib']
	if sys.platform.startswith("linux"):
		playbox.linkflags = ['./lib/libtorrent.so', './lib/libavformat.so']
  
	playbox.source = ["playbox/playbox.cc"]
	playbox.includes = ['libtorrent/include', '/opt/local/include', 'deps/ffmpeg/libavformat']
	playbox.cflags = ['-Wall']
	playbox.cxxflags = ['-Wall']

def install_libs(bld):
	if not exists('build/lib'):
		makedirs('build/lib')
	
	if exists('build/default/playbox.node'):
		copy2(abspath('build/default/playbox.node'), 'build/lib/playbox.node')
	
	if exists('build/default/libtorrent.dylib'):
		copy2(abspath('build/default/libtorrent.dylib'), 'build/lib/libtorrent.dylib')
	elif exists('build/default/libtorrent.so'):
		copy2(abspath('build/default/libtorrent.so'), 'build/lib/libtorrent.so')
	
	if exists('deps/ffmpeg/libavformat/libavformat.so'):
		copy2(abspath('deps/ffmpeg/libavformat/libavformat.so'), 'build/lib/libavformat.so')
	elif exists('deps/ffmpeg/libavformat/libavformat.dylib'):
		copy2(abspath('deps/ffmpeg/libavformat/libavformat.dylib'), 'build/lib/libavformat.dylib')
	
	if exists('deps/ffmpeg/libavformat/libavcodec.so'):
		copy2(abspath('deps/ffmpeg/libavcodec/libavcodec.so'), 'build/lib/libavcodec.so')
	elif exists('deps/ffmpeg/libavcodec/libavcodec.dylib'):
		copy2(abspath('deps/ffmpeg/libavcodec/libavcodec.dylib'), 'build/lib/libavcodec.dylib')
	
	if exists('deps/ffmpeg/libavformat/libavutil.so'):
		copy2(abspath('deps/ffmpeg/libavutil/libavutil.so'), 'build/lib/libavutil.so')
	elif exists('deps/ffmpeg/libavutil/libavutil.dylib'):
		copy2(abspath('deps/ffmpeg/libavutil/libavutil.dylib'), 'build/lib/libavutil.dylib')

def build_libtorrent(bld):
	libtorrent = bld.new_task_gen("cxx", "shlib", install_path=None, target="torrent", defs="libtorrent.def")
	libtorrent.name = "torrent"
	libtorrent.target = "torrent"
	libtorrent.cxxflags = ["-I../libtorrent/include"]
	libtorrent.cflags = ["-I../libtorrent/include", "-fPIC", "-fvisibility=hidden"]
	libtorrent.includes = ['libtorrent/include', '/opt/local/include']
	libtorrent.uselib = 'BOOST_THREAD BOOST_SYSTEM BOOST_FILESYSTEM PTHREAD'
	libtorrent.libpath = ['/usr/lib', '/usr/local/lib', '/opt/local/lib']
	libtorrent.defines = [
		"NDEBUG",
		"TORRENT_USE_TOMMATH",
		"TORRENT_STATS",
		"TORRENT_DISK_STATS",
#		"TORRENT_LOGGING",
		"TORRENT_NO_DEPRECATE",
		"TORRENT_NO_ASSERTS=1",
		"_FILE_OFFSET_BITS=64",
		"BOOST_ASIO_ENABLE_CANCELIO"
	]
	libtorrent.source = [
		"libtorrent/src/GeoIP.c",
		"libtorrent/src/mpi.c",
		"libtorrent/src/ConvertUTF.cpp",
		"libtorrent/src/alert.cpp",
		"libtorrent/src/allocator.cpp",
		"libtorrent/src/assert.cpp", # compile me without asserts?
		"libtorrent/src/bandwidth_limit.cpp",
		"libtorrent/src/bandwidth_manager.cpp",
		"libtorrent/src/bandwidth_queue_entry.cpp",
		"libtorrent/src/broadcast_socket.cpp",
		"libtorrent/src/bt_peer_connection.cpp",
		"libtorrent/src/connection_queue.cpp",
		"libtorrent/src/create_torrent.cpp",
		"libtorrent/src/disk_buffer_holder.cpp",
		"libtorrent/src/disk_io_thread.cpp",
		"libtorrent/src/entry.cpp",
		"libtorrent/src/enum_net.cpp",
		"libtorrent/src/error_code.cpp",
		"libtorrent/src/escape_string.cpp",
		"libtorrent/src/file.cpp",
		"libtorrent/src/file_pool.cpp",
		"libtorrent/src/file_storage.cpp",
		"libtorrent/src/gzip.cpp",
		"libtorrent/src/http_connection.cpp",
		"libtorrent/src/http_parser.cpp",
		"libtorrent/src/http_seed_connection.cpp",
		"libtorrent/src/http_stream.cpp",
		"libtorrent/src/http_tracker_connection.cpp",
		"libtorrent/src/i2p_stream.cpp",
		"libtorrent/src/identify_client.cpp",
		"libtorrent/src/instantiate_connection.cpp",
		"libtorrent/src/ip_filter.cpp",
		"libtorrent/src/lazy_bdecode.cpp",
		"libtorrent/src/logger.cpp",
		"libtorrent/src/lsd.cpp",
		"libtorrent/src/lt_trackers.cpp",
		"libtorrent/src/magnet_uri.cpp",
		"libtorrent/src/metadata_transfer.cpp",
		"libtorrent/src/natpmp.cpp",
		"libtorrent/src/parse_url.cpp",
		"libtorrent/src/pe_crypto.cpp",
		"libtorrent/src/peer_connection.cpp",
		"libtorrent/src/piece_picker.cpp",
		"libtorrent/src/policy.cpp",
		"libtorrent/src/puff.cpp",
		"libtorrent/src/session.cpp",
		"libtorrent/src/session_impl.cpp",
		"libtorrent/src/settings.cpp",
		"libtorrent/src/sha1.cpp",
		"libtorrent/src/smart_ban.cpp",
		"libtorrent/src/socket_io.cpp",
		"libtorrent/src/socket_type.cpp",
		"libtorrent/src/socks5_stream.cpp",
		"libtorrent/src/stat.cpp",
		"libtorrent/src/storage.cpp",
		"libtorrent/src/thread.cpp",
		"libtorrent/src/time.cpp",
		"libtorrent/src/torrent.cpp",
		"libtorrent/src/torrent_handle.cpp",
		"libtorrent/src/torrent_info.cpp",
		"libtorrent/src/tracker_manager.cpp",
		"libtorrent/src/udp_socket.cpp",
		"libtorrent/src/udp_tracker_connection.cpp", # compile me?
		"libtorrent/src/upnp.cpp",
		"libtorrent/src/ut_metadata.cpp",
		"libtorrent/src/ut_pex.cpp",
		"libtorrent/src/web_connection_base.cpp",
		"libtorrent/src/web_peer_connection.cpp",
		"libtorrent/src/kademlia/dht_tracker.cpp",
		"libtorrent/src/kademlia/find_data.cpp",
		"libtorrent/src/kademlia/node.cpp",
		"libtorrent/src/kademlia/node_id.cpp",
		"libtorrent/src/kademlia/refresh.cpp",
		"libtorrent/src/kademlia/routing_table.cpp",
		"libtorrent/src/kademlia/rpc_manager.cpp",
		"libtorrent/src/kademlia/traversal_algorithm.cpp"
	]
	libtorrent.source = bld.path.ant_glob('libtorrent/src/*.c')+' '+bld.path.ant_glob('libtorrent/src/*.cpp')+' '+bld.path.ant_glob('libtorrent/src/kademlia/*.cpp')+' '+bld.path.ant_glob('libtorrent/include/*')
	
	#bld.install_files('build/release/libs', 'build/default/libtorrent.so')
	#bld.install_files('${PREFIX}/include/libtorrent/', 'libtorrent/include/libtorrent/*.hpp')
	#bld.install_files('release/')
	

def shutdown(ctx):
	#todo: implement copytree to resolve all the symlinks
	if Options.commands['clean']:
		if exists('playbox.node'): unlink('playbox.node')
	else:
		if not exists('build/release/lib'):
			makedirs('build/release/lib')
		
		# generic libs
		if exists('build/lib/libtorrent.so'):
			copy2(abspath('build/lib/libtorrent.so'), 'build/release/lib/libtorrent.so')
		elif exists('build/lib/libtorrent.dylib'):
			copy2(abspath('build/lib/libtorrent.dylib'), 'build/release/lib/libtorrent.dylib')
		
		if exists('build/lib/libavformat.so'):
			copy2(abspath('build/lib/libavformat.so'), 'build/release/lib/libavformat.so')
		elif exists('build/lib/libavformat.dylib'):
			copy2(abspath('build/lib/libavformat.dylib'), 'build/release/lib/libavformat.dylib')
		
		if exists('build/lib/libavcodec.so'):
			copy2(abspath('build/lib/libavcodec.so'), 'build/release/lib/libavcodec.so')
		elif exists('build/lib/libavcodec.dylib'):
			copy2(abspath('build/lib/libavcodec.dylib'), 'build/release/lib/libavcodec.dylib')
		
		if exists('build/lib/libavutil.so'):
			copy2(abspath('build/lib/libavutil.so'), 'build/release/lib/libavutil.so')
		elif exists('build/lib/libavutil.dylib'):
			copy2(abspath('build/lib/libavutil.dylib'), 'build/release/lib/libavutil.dylib')
		
		# ffprobe & libs (not necessary)
		#if exists('deps/ffmpeg/ffprobe') and not lexists('build/release/ffprobe'):
		#	symlink(abspath('deps/ffmpeg/ffprobe'), 'build/release/ffprobe')
		#if exists('deps/ffmpeg/libavdevice/libavdevice.so') and not lexists('build/release/lib/libavdevice.so'):
		#	symlink(abspath('deps/ffmpeg/libavdevice/libavdevice.so'), 'build/release/lib/libavdevice.so')
		#elif exists('deps/ffmpeg/libavdevice/libavdevice.dylib') and not lexists('build/release/lib/libavdevice.dylib'):
		#	symlink(abspath('deps/ffmpeg/libavdevice/libavdevice.dylib'), 'build/release/lib/libavdevice.dylib')
		#if exists('deps/ffmpeg/libavfilter/libavfilter.so') and not lexists('build/release/lib/libavfilter.so'):
		#	symlink(abspath('deps/ffmpeg/libavfilter/libavfilter.so'), 'build/release/lib/libavfilter.so')
		#elif exists('deps/ffmpeg/libavfilter/libavfilter.dylib') and not lexists('build/release/lib/libavfilter.dylib'):
		#	symlink(abspath('deps/ffmpeg/libavfilter/libavfilter.dylib'), 'build/release/lib/libavfilter.dylib')
		#if exists('deps/ffmpeg/libswscale/libswscale.so') and not lexists('build/release/lib/libswscale.so'):
		#	symlink(abspath('deps/ffmpeg/libswscale/libswscale.so'), 'build/release/lib/libswscale.so')
		#elif exists('deps/ffmpeg/libswscale/libswscale.dylib') and not lexists('build/release/lib/libswscale.dylib'):
		#	symlink(abspath('deps/ffmpeg/libswscale/libswscale.dylib'), 'build/release/lib/libswscale.dylib')
		#if exists('deps/ffmpeg/libpostproc/libpostproc.so') and not lexists('build/release/lib/libpostproc.so'):
		#	symlink(abspath('deps/ffmpeg/libpostproc/libpostproc.so'), 'build/release/lib/libpostproc.so')
		#elif exists('deps/ffmpeg/libpostproc/libpostproc.dylib') and not lexists('build/release/lib/libpostproc.dylib'):
		#	symlink(abspath('deps/ffmpeg/libpostproc/libpostproc.dylib'), 'build/release/lib/libpostproc.dylib')
		
		if exists('public') and not lexists('build/release/public'):
			symlink(abspath('public'), 'build/release/public')
		
		# node libs
		if exists('deps/socket.io') and not lexists('build/release/lib/socket.io'):
			symlink(abspath('deps/socket.io'), 'build/release/lib/socket.io')
	
		if exists('deps/node-id3/lib/id3') and not lexists('build/release/lib/node-id3'):
			symlink(abspath('deps/node-id3/lib/id3'), 'build/release/lib/node-id3')
			
		if exists('deps/node-strtok/lib') and not lexists('build/release/lib/node-strtok'):
			symlink(abspath('deps/node-strtok/lib'), 'build/release/lib/node-strtok')
		
		if exists('deps/sha1_stream/sha1_stream.js') and not lexists('build/release/lib/sha1_stream.js'):
			symlink(abspath('deps/sha1_stream/sha1_stream.js'), 'build/release/lib/sha1_stream.js')
		
		if exists('deps/long-stack-traces/lib/long-stack-traces.js') and not lexists('build/release/lib/long-stack-traces.js'):
			symlink(abspath('deps/long-stack-traces/lib/long-stack-traces.js'), 'build/release/lib/long-stack-traces.js')
		
		if exists('deps/requirejs/require.js') and not lexists('build/release/require.js'):
			symlink(abspath('deps/requirejs/require.js'), 'build/release/require.js')
			symlink(abspath('deps/requirejs/require'), 'build/release/require')
		
		# node libs
		if exists('build/default/playbox.node'):
			copy2('build/default/playbox.node', 'build/release/lib/playbox.node')
		
		if exists('deps/node-iconv/iconv.node'):
			copy2('deps/node-iconv/iconv.node', 'build/release/lib/iconv.node')
		
		# custom node
		# todo: if this doesn't exist, then build node
		if exists('deps/node/build/default/node') and not exists('build/release/node'):
			copy2(abspath('deps/node/build/default/node'), 'build/release/node')
		
		# do symlinks
		if not lexists('build/release/main.js'):
			symlink(abspath('main.js'), 'build/release/main.js')
		if not lexists('build/release/poem.js'):
			symlink(abspath('poem.js'), 'build/release/poem.js')
		if not lexists('build/release/connection.js'):
			symlink(abspath('connection.js'), 'build/release/connection.js')
		if not lexists('build/release/lib/edb.js'):
			symlink(abspath('edb.js'), 'build/release/lib/edb.js')
		if not lexists('build/release/lib/bencode.js'):
			symlink(abspath('lib/bencode.js'), 'build/release/lib/bencode.js')
		if not lexists('build/release/lib/http.js'):
			symlink(abspath('lib/http.js'), 'build/release/lib/http.js')
		
		if not lexists('build/release/config.json'):
			symlink(abspath('config.json'), 'build/release/config.json')
		if not lexists('build/release/applist.json'):
			symlink(abspath('applist.json'), 'build/release/applist.json')
		
		# default apps
		if not exists('build/release/apps'):
			symlink(abspath('apps'), 'build/release/apps')
