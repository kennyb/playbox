#!/usr/bin/env python

import Options
from os import unlink, symlink, popen
from os.path import exists 

srcdir = "."
blddir = "build"
VERSION = "1.0"

def set_options(opt):
  opt.tool_options("compiler_cxx")
  opt.add_option( '--debug'
                , action='store_true'
                , default=False
                , help='Build debug variant [Default: False]'
                , dest='debug'
                )  

def configure(conf):
  conf.check_tool("compiler_cxx")
  conf.check_tool("node_addon")
  conf.env.append_value('CXXFLAGS', ['-DDEBUG', '-g', '-O0', '-Wall', '-Wextra'])

  # conf.check(lib='node', libpath=['/usr/lib', '/usr/local/lib'], uselib_store='NODE')

def build(bld):
  obj = bld.new_task_gen("cxx", "shlib", "node_addon")
  obj.target = "playbox"
  obj.source = ["playbox.cc"]
  more_sources = [
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
  # obj.uselib = "NODE"

def shutdown():
  # HACK to get compress.node out of build directory.
  # better way to do this?
  if Options.commands['clean']:
    if exists('playbox.node'): unlink('playbox.node')
  else:
    if exists('build/default/playbox.node') and not exists('playbox.node'):
      symlink('build/default/playbox.node', 'playbox.node')
