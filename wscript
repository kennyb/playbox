#!/usr/bin/env python

import Options
import sys
from os import unlink, symlink, popen, environ, makedirs
from os.path import exists, abspath
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
	conf.env.append_value('CFLAGS', ['-Os', '-ffunction-sections', '-fPIC'])
	conf.env.append_value('CXXFLAGS', ['-Os', '-ffunction-sections'])
	
	if sys.platform.startswith("darwin"):
		conf.env.append_value('LINKFLAGS', ['-Wl,-dead_strip'])
		conf.env.append_value('LINKFLAGS', ['-Wl,-bind_at_load'])
	elif sys.platform.startswith("linux"):
		conf.env.append_value('LINKFLAGS', ['-Wl,--gc-section'])
	
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
	build_id3(bld)
	build_libtorrent(bld)
	
	bld.add_group('libs_built')
	install_libs(bld)
	install_app(bld)
	
	bld.add_group('playbox')
	build_playbox(bld)
	#bld.add_post_fun(build_playbox)
	
def build_playbox(bld):
	playbox = bld.new_task_gen("cxx", "shlib", "node_addon", install_path=None, use="torrent")
	playbox.name = "playbox"
	playbox.target = "playbox"
	playbox.linkflags = ['libs/libtorrent.so', 'libs/libid3.so']
	#playbox.cxxflags = ["-I../id3lib/include", "-I../libtorrent/include"]
	#playbox.cflags = ["-I../id3lib/include", "-I../libtorrent/include"]
	playbox.uselib = 'BOOST_THREAD BOOST_SYSTEM BOOST_FILESYSTEM BOOST_IOSTREAMS'
	#playbox.uselib_local = ['torrent', 'id3']
	playbox.source = ["playbox.cc"]
	playbox.includes = ['id3lib/include', 'libtorrent/include', '/opt/local/include']
	playbox.cflags = ['-Wall', '-Wextra']
	playbox.cxxflags = ['-Wall', '-Wextra']

def install_app(bld):
	#copytree('app', 'build/release')
	#copy2('app/main.js', 'build/release')
	pass

def install_libs(bld):
	if not exists('build/libs'):
		makedirs('build/libs')
	
	if exists('build/default/playbox.node') and not exists('build/libs/playbox.node'):
		symlink('build/default/playbox.node', 'build/libs')
	
	if exists('build/default/libtorrent.dylib') and not exists('build/libs/libtorrent.dylib'):
		symlink('build/default/libtorrent.dylib', 'build/libs')
	elif exists('build/default/libtorrent.so') and not exists('build/libs/libtorrent.so'):
		symlink('build/default/libtorrent.so', 'build/libs')
		
	if exists('build/default/libid3.dylib') and not exists('build/libs/libid3.dylib'):
		symlink('build/default/libid3.dylib', 'build/libs')
	elif exists('build/default/libid3.so') and not exists('build/libs/libid3.so'):
		symlink('build/default/libid3.so', 'build/libs')

def build_id3(bld):
	id3 = bld.new_task_gen("cxx", "shlib", install_path=None, target="torrent", defs="id3.def")
	id3.name = "id3"
	id3.target = "id3"
	id3.cxxflags = ["-I../id3lib/include"]
	id3.cflags = ["-I../id3lib/include"]
	id3.includes = ['id3lib', 'id3lib/include', 'id3lib/include/id3', '/opt/local/include']
	id3.uselib = "ZLIB ICONV LIBC"
	id3.defines = ['HAVE_CONFIG_H']
	id3.source = bld.path.ant_glob('id3lib/src/*.cpp')
	id3.linkflags = ["-flat_namespace"]
	if sys.platform.startswith("darwin"):
		id3.linkflags += ["-undefined", "suppress"]

def build_libtorrent(bld):
	libtorrent = bld.new_task_gen("cxx", "shlib", install_path=None, target="torrent", defs="libtorrent.def")
	libtorrent.name = "torrent"
	libtorrent.target = "torrent"
	libtorrent.cxxflags = ["-I../libtorrent/include"]
	libtorrent.cflags = ["-I../libtorrent/include", "-fPIC"]
	libtorrent.includes = ['libtorrent/include', '/opt/local/include']
	libtorrent.uselib = 'BOOST_THREAD BOOST_SYSTEM BOOST_FILESYSTEM BOOST_DATE_TIME BOOST_IOSTREAMS PTHREAD'
	libtorrent.libpath = ['/usr/lib', '/usr/local/lib', '/opt/local/lib']
	libtorrent.defines = ["NDEBUG", "TORRENT_USE_TOMMATH", "_FILE_OFFSET_BITS=64"]
	libtorrent.source = [
		"libtorrent/src/GeoIP.c",
		"libtorrent/src/mpi.c",
		"libtorrent/src/ConvertUTF.cpp",
		"libtorrent/src/alert.cpp",
		"libtorrent/src/allocator.cpp",
		"libtorrent/src/assert.cpp",
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
		"libtorrent/src/udp_tracker_connection.cpp",
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
		if exists('build/default/playbox.node') and not exists('playbox.node'):
			symlink('build/default/playbox.node', 'playbox.node')

		if not exists('build/release/libs'):
			makedirs('build/release/libs')
		
		# generic libs
		print abspath('build/libs/libtorrent.so')
		if exists('build/libs/libtorrent.so') and not exists('build/release/libs/libtorrent.so'):
			symlink(abspath('build/libs/libtorrent.so'), 'build/release/libs/libtorrent.so')
		elif exists('build/libs/libtorrent.dylib') and not exists('build/release/libs/libtorrent.dylib'):
			symlink(abspath('build/libs/libtorrent.dylib'), 'build/release/libs/libtorrent.dylib')
		
		if exists('build/libs/libid3.so') and not exists('build/release/libs/libid3.so'):
			symlink(abspath('build/libs/libid3.so'), 'build/release/libs/libid3.so')
		elif exists('build/libs/libid3.dylib') and not exists('build/release/libs/libid3.dylib'):
			symlink(abspath('build/libs/libid3.dylib'), 'build/release/libs/libid3.dylib')
		
		# node libs
		if exists('build/default/playbox.node') and not exists('build/release/libs/playbox.node'):
			symlink(abspath('build/default/playbox.node'), 'build/release/libs/playbox.node')
		
		# custom node
		# todo: if this doesn't exist, then build node
		if exists('node/build/default/node') and not exists('build/release/node'):
			symlink(abspath('node/build/default/node'), 'build/release/node')
		
		# app
		if not exists('build/release/main.js'):
			symlink(abspath('app/main.js'), 'build/release/main.js')
		
		# default apps
		if not exists('build/release/apps'):
			symlink(abspath('apps'), 'build/release/apps')
