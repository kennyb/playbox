#!/usr/bin/env python

import Options
import sys
from os import unlink, removedirs, symlink, popen, environ, makedirs
from os.path import exists, lexists, abspath
from shutil import copy2, copytree, rmtree

srcdir = "."
top = "release"
blddir = "build"
APPNAME = "playbox"
VERSION = "0.1.0"

def canonical_cpu_type(arch):
	m = {'x86': 'ia32', 'i386':'ia32', 'x86_64':'x64', 'amd64':'x64'}
	if arch in m: arch = m[arch]
	if not arch in supported_archs:
		raise Exception("supported architectures are "+', '.join(supported_archs)+" but NOT '" + arch + "'.")
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
	conf.env.append_value('CFLAGS', ['-Os', '-ffunction-sections', '-fdata-sections', '-fPIC'])
	conf.env.append_value('CXXFLAGS', ['-Os', '-ffunction-sections', '-fdata-sections', '-fno-rtti'])
	
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
	bld.add_group('libtorrent')
	build_libtorrent(bld)
	
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
	playbox.includes = ['deps/libtorrent/include', '/opt/local/include', 'deps/libav/libavformat']
	playbox.cflags = ['-Wall']
	playbox.cxxflags = ['-Wall']

def build_libtorrent(bld):
	libtorrent = bld.new_task_gen("cxx", "shlib", install_path=None, target="torrent", defs="deps/libtorrent.def")
	libtorrent.name = "torrent"
	libtorrent.target = "torrent"
	libtorrent.cxxflags = ["-I../deps/libtorrent/include"]
	libtorrent.cflags = ["-I../deps/libtorrent/include", "-fPIC", "-fvisibility=hidden"]
	libtorrent.includes = ['deps/libtorrent/include', '/opt/local/include']
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
		"deps/libtorrent/src/GeoIP.c",
		"deps/libtorrent/src/mpi.c",
		"deps/libtorrent/src/ConvertUTF.cpp",
		"deps/libtorrent/src/alert.cpp",
		"deps/libtorrent/src/allocator.cpp",
		"deps/libtorrent/src/assert.cpp", # compile me without asserts?
		"deps/libtorrent/src/bandwidth_limit.cpp",
		"deps/libtorrent/src/bandwidth_manager.cpp",
		"deps/libtorrent/src/bandwidth_queue_entry.cpp",
		"deps/libtorrent/src/broadcast_socket.cpp",
		"deps/libtorrent/src/bt_peer_connection.cpp",
		"deps/libtorrent/src/connection_queue.cpp",
		"deps/libtorrent/src/create_torrent.cpp",
		"deps/libtorrent/src/disk_buffer_holder.cpp",
		"deps/libtorrent/src/disk_io_thread.cpp",
		"deps/libtorrent/src/entry.cpp",
		"deps/libtorrent/src/enum_net.cpp",
		"deps/libtorrent/src/error_code.cpp",
		"deps/libtorrent/src/escape_string.cpp",
		"deps/libtorrent/src/file.cpp",
		"deps/libtorrent/src/file_pool.cpp",
		"deps/libtorrent/src/file_storage.cpp",
		"deps/libtorrent/src/gzip.cpp",
		"deps/libtorrent/src/http_connection.cpp",
		"deps/libtorrent/src/http_parser.cpp",
		"deps/libtorrent/src/http_seed_connection.cpp",
		"deps/libtorrent/src/http_stream.cpp",
		"deps/libtorrent/src/http_tracker_connection.cpp",
		"deps/libtorrent/src/i2p_stream.cpp",
		"deps/libtorrent/src/identify_client.cpp",
		"deps/libtorrent/src/instantiate_connection.cpp",
		"deps/libtorrent/src/ip_filter.cpp",
		"deps/libtorrent/src/lazy_bdecode.cpp",
		"deps/libtorrent/src/logger.cpp",
		"deps/libtorrent/src/lsd.cpp",
		"deps/libtorrent/src/lt_trackers.cpp",
		"deps/libtorrent/src/magnet_uri.cpp",
		"deps/libtorrent/src/metadata_transfer.cpp",
		"deps/libtorrent/src/natpmp.cpp",
		"deps/libtorrent/src/parse_url.cpp",
		"deps/libtorrent/src/pe_crypto.cpp",
		"deps/libtorrent/src/peer_connection.cpp",
		"deps/libtorrent/src/piece_picker.cpp",
		"deps/libtorrent/src/policy.cpp",
		"deps/libtorrent/src/puff.cpp",
		"deps/libtorrent/src/session.cpp",
		"deps/libtorrent/src/session_impl.cpp",
		"deps/libtorrent/src/settings.cpp",
		"deps/libtorrent/src/sha1.cpp",
		"deps/libtorrent/src/smart_ban.cpp",
		"deps/libtorrent/src/socket_io.cpp",
		"deps/libtorrent/src/socket_type.cpp",
		"deps/libtorrent/src/socks5_stream.cpp",
		"deps/libtorrent/src/stat.cpp",
		"deps/libtorrent/src/storage.cpp",
		"deps/libtorrent/src/thread.cpp",
		"deps/libtorrent/src/time.cpp",
		"deps/libtorrent/src/torrent.cpp",
		"deps/libtorrent/src/torrent_handle.cpp",
		"deps/libtorrent/src/torrent_info.cpp",
		"deps/libtorrent/src/tracker_manager.cpp",
		"deps/libtorrent/src/udp_socket.cpp",
		"deps/libtorrent/src/udp_tracker_connection.cpp", # compile me?
		"deps/libtorrent/src/upnp.cpp",
		"deps/libtorrent/src/ut_metadata.cpp",
		"deps/libtorrent/src/ut_pex.cpp",
		"deps/libtorrent/src/web_connection_base.cpp",
		"deps/libtorrent/src/web_peer_connection.cpp",
		"deps/libtorrent/src/kademlia/dht_tracker.cpp",
		"deps/libtorrent/src/kademlia/find_data.cpp",
		"deps/libtorrent/src/kademlia/node.cpp",
		"deps/libtorrent/src/kademlia/node_id.cpp",
		"deps/libtorrent/src/kademlia/refresh.cpp",
		"deps/libtorrent/src/kademlia/routing_table.cpp",
		"deps/libtorrent/src/kademlia/rpc_manager.cpp",
		"deps/libtorrent/src/kademlia/traversal_algorithm.cpp"
	]
	libtorrent.source = bld.path.ant_glob("deps/libtorrent/src/*.c")+' '+bld.path.ant_glob("deps/libtorrent/src/*.cpp")+' '+bld.path.ant_glob("deps/libtorrent/src/kademlia/*.cpp")+' '+bld.path.ant_glob("deps/libtorrent/include/*")

def shutdown(ctx):
	print "done"
