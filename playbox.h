#ifndef PLAYBOX_H_
#define PLAYBOX_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

#include <libtorrent/entry.hpp>

using namespace v8;
using namespace node;

class Playbox : public EventEmitter {
  public:    
    Playbox() : EventEmitter() {}
    ~Playbox() {}
    
    static void Initialize(Handle<Object> target);
	static Handle<Value> init(const Arguments &args);
	static Handle<Value> start(const Arguments &args);
	static Handle<Value> stop(const Arguments &args);
	static Handle<Value> update(const Arguments &args);
	static Handle<Value> query(const Arguments &args);
	static Handle<Value> archive(const Arguments &args);
	static Handle<Value> info(const Arguments &args);
	static Handle<Value> add_archive(const Arguments &args);
	static Handle<Value> add_archive_metadata(const Arguments &args);

	static void load_torrent(const std::string torrent_path);
	static void make_torrent(const std::string path);
	
  private:
    static Handle<Value> New(const Arguments &args);
	//static int save_id3_info(const ID3_Tag &tag, libtorrent::entry *metadata);
};

#endif  // PLAYBOX_H_
