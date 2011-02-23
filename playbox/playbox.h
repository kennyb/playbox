#ifndef PLAYBOX_H_
#define PLAYBOX_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

//#include <libtorrent/entry.hpp>
#include <boost/filesystem/path.hpp>

using namespace v8;
using namespace node;

class Playbox : public EventEmitter
{
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
	static Handle<Value> get_metadata(const Arguments &args);
	static Handle<Value> make_torrent(const Arguments &args);
	static Handle<Value> load_torrent(const Arguments &args);
	
  private:
    static Handle<Value> New(const Arguments &args);
	//static int save_id3_info(const ID3_Tag &tag, libtorrent::entry *metadata);
};

//TODO: improve me, this was something I copied from the internet
// what I really want is a utf-8 compatible trim which gobbles all whitespace and everything below 0x20 (space)
inline std::string trim(const std::string& src, const std::string& c = " \r\n")
{
	unsigned int p2 = src.find_last_not_of(c);
	if (p2 == std::string::npos) return std::string();
	unsigned int p1 = src.find_first_not_of(c);
	if (p1 == std::string::npos) p1 = 0;
	return src.substr(p1, (p2-p1)+1);
}


#endif  // PLAYBOX_H_
