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


// trim functions ripped from
// http://www.zedwood.com/article/107/cpp-trim-function
std::string& trim(std::string &str)
{
    int i,j,start,end;

    //ltrim
    for (i=0; (str[i]!=0 && str[i]<=32); )
        i++;
    start=i;

    //rtrim
    for(i=0,j=0; str[i]!=0; i++)
        j = ((str[i]<=32)? j+1 : 0);
    end=i-j;
    str = str.substr(start,end-start);
    return str;
}
std::string& ltrim(std::string &str)
{
    int i,start;

    for (i=0; (str[i]!=0 && str[i]<=32); )
        i++;
    start=i;

    str = str.substr(start,str.length()-start);
    return str;
}
std::string& rtrim(std::string &str)
{
    int i,j,end;

    for(i=0,j=0; str[i]!=0; i++)
        j = ((str[i]<=32)? j+1 : 0);
    end=i-j;

    str = str.substr(0,end);
    return str;
}


#endif  // PLAYBOX_H_
