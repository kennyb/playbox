#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <pwd.h>
#include <v8.h>
#include <node.h>
#include <node_events.h>
#include <node_buffer.h>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

#include <libtorrent/entry.hpp>
#include <libtorrent/bencode.hpp>
#include <libtorrent/torrent_info.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/file.hpp>
#include <libtorrent/storage.hpp>
#include <libtorrent/hasher.hpp>
#include <libtorrent/create_torrent.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/alert.hpp>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/extensions/metadata_transfer.hpp>
#include <libtorrent/extensions/ut_metadata.hpp>
#include <libtorrent/extensions/smart_ban.hpp>
#include <libtorrent/extensions/ut_pex.hpp>

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>
#include <boost/filesystem/fstream.hpp>
#include <boost/bind.hpp>
#include <boost/lexical_cast.hpp>

extern "C" {
	//#include <avcodec.h>
	#include <avformat.h>
}

#define BOOST_NO_EXCEPTIONS
#ifndef BOOST_NO_EXCEPTIONS
#include <boost/exception/error_info.hpp>
#include <boost/exception/get_error_info.hpp>
typedef boost::error_info<struct tag_stack_str, std::string> stack_error_info;
#endif

#include "playbox.h"

using namespace v8;
using namespace node;
using namespace boost;

// static function declarations
static std::string xml_special_chars(std::string str);

// static vars
static libtorrent::session cur_session;
static std::string library_dir;
static std::string torrents_dir;
static std::string tmp_path;
//static std::map<std::string, libtorrent::lazy_entry> torrents_metadata;
static Playbox *playbox;

// events
static Persistent<String> symbol_stateChange = NODE_PSYMBOL("stateChanged");
static Persistent<String> symbol_listening = NODE_PSYMBOL("listening");
static Persistent<String> symbol_listeningFailed = NODE_PSYMBOL("listeningFailed");
static Persistent<String> symbol_archiveUnknown = NODE_PSYMBOL("archiveUnknown");
static Persistent<String> symbol_archivePaused = NODE_PSYMBOL("archivePaused");
static Persistent<String> symbol_archiveResumed = NODE_PSYMBOL("archiveResumed");
static Persistent<String> symbol_archiveLoaded = NODE_PSYMBOL("archiveLoaded");
static Persistent<String> symbol_archiveDownloading = NODE_PSYMBOL("archiveDownloading");
static Persistent<String> symbol_archiveProgress = NODE_PSYMBOL("archiveProgress");
static Persistent<String> symbol_archiveComplete = NODE_PSYMBOL("archiveComplete");
static Persistent<String> symbol_archiveRemoved = NODE_PSYMBOL("archiveRemoved");


static Handle<Value> VException(const char *msg) {
	HandleScope scope;
	return ThrowException(Exception::Error(String::New(msg)));
};

static Handle<Value> __library_dir(Local<String> property, const AccessorInfo& info) {
	return String::New(library_dir.c_str());
}

static Handle<Value> __torrents_dir(Local<String> property, const AccessorInfo& info) {
	return String::New(torrents_dir.c_str());
}

static Handle<Value> __tmp_path(Local<String> property, const AccessorInfo& info) {
	return String::New(tmp_path.c_str());
}

// unused at the moment...
class Archive : public EventEmitter {
  public:
	static void Initialize(v8::Handle<v8::Object> target) {
		HandleScope scope;

		symbol_metadata = NODE_PSYMBOL("metadata");
		symbol_downloading = NODE_PSYMBOL("downloading");
		symbol_progress = NODE_PSYMBOL("progress");
		symbol_complete = NODE_PSYMBOL("complete");
		symbol_paused = NODE_PSYMBOL("paused");

		Local<FunctionTemplate> t = FunctionTemplate::New(New);

		t->Inherit(EventEmitter::constructor_template);
		t->InstanceTemplate()->SetInternalFieldCount(1);

		//NODE_SET_PROTOTYPE_METHOD(t, "", func);

		target->Set(String::NewSymbol("Archive"), t->GetFunction());
	}
	
  protected:
	static Handle<Value> New(const Arguments& args) {
		HandleScope scope;

		Archive *archive = new Archive();
		archive->Wrap(args.This());

		return args.This();
	}
	
  private:
	//static libtorrent::torrent_handle handle;
	static Persistent<String> symbol_metadata;
	static Persistent<String> symbol_downloading;
	static Persistent<String> symbol_progress;
	static Persistent<String> symbol_complete;
	static Persistent<String> symbol_paused;
};

void Playbox::Initialize(v8::Handle<v8::Object> target)
{
	// Grab the scope of the call from Node
	HandleScope scope;
	// Define a new function template
	Local<FunctionTemplate> t = FunctionTemplate::New(New);
	t->Inherit(EventEmitter::constructor_template);
	t->InstanceTemplate()->SetInternalFieldCount(1);
	t->SetClassName(String::NewSymbol("Playbox"));
	//constructor_template = Persistent<FunctionTemplate>::New(t);
	//constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
	
	// starts the server on the specified ports
	NODE_SET_PROTOTYPE_METHOD(t, "start", start);
	
	// stops the server and pauses all downloads
	NODE_SET_PROTOTYPE_METHOD(t, "stop", stop);
	
	// returns an object with the archive status
	NODE_SET_PROTOTYPE_METHOD(t, "archive", archive);
	
	// returns the torrent of the archive (to be used for downloading / uploading)
	NODE_SET_PROTOTYPE_METHOD(t, "make_archive_torrent", make_archive_torrent);
	
	// adds a archive into the library
	NODE_SET_PROTOTYPE_METHOD(t, "load_torrent", load_torrent);
	
	// adds a physical torrent file into the library
	NODE_SET_PROTOTYPE_METHOD(t, "add_archive_metadata", add_archive_metadata);
	
	// returns all information about an archive (how the program discovers it)
	NODE_SET_PROTOTYPE_METHOD(t, "get_archive_metadata", get_archive_metadata);
	
	// run an update pass
	NODE_SET_PROTOTYPE_METHOD(t, "update", update);
	
	t->PrototypeTemplate()->SetAccessor(String::NewSymbol("library_dir"), __library_dir);
	t->PrototypeTemplate()->SetAccessor(String::NewSymbol("torrents_dir"), __torrents_dir);
	t->PrototypeTemplate()->SetAccessor(String::NewSymbol("tmp_path"), __tmp_path);
	
	target->Set(String::NewSymbol("Playbox"), t->GetFunction());
	
	// avformat
	av_register_all();
	avcodec_register_all();
	
	// ----------------
	
	playbox = new Playbox();
	
	// ----------------
	
	uid_t uid = getuid();
	struct passwd* user_passwd = getpwuid(uid);
	
	if(user_passwd) {
		library_dir = user_passwd->pw_dir;
		library_dir += "/Library/";
		filesystem::create_directory(filesystem::path(::library_dir));
		
		library_dir += "playbox/";
		filesystem::create_directory(filesystem::path(::library_dir));
		// now, chroot to the dir
		
		::torrents_dir = std::string(::library_dir).append(".torrents/");
		filesystem::path p(::torrents_dir);
		if(!filesystem::exists(p)) {
			filesystem::create_directory(p);
		}
		
		::tmp_path = std::string(::library_dir).append(".tmp/");
		p = filesystem::path(::tmp_path);
		if(!filesystem::exists(p)) {
			filesystem::create_directory(p);
		}
		
	} else {
		// todo: move most of this into the constructor, and separate the static functions from the methods
		//return VException("playbox could not find the user's home directory! HUGE FAIL");
	}
}

// Create a new instance of BSON and assing it the existing context
Handle<Value> Playbox::New(const Arguments &args)
{
	HandleScope scope;
	
	//Playbox *playbox = new Playbox();
	playbox->Wrap(args.This());
	return args.This();
}

Handle<Value> Playbox::start(const Arguments &args) {
	int32_t port1 = 6881;
	int32_t port2 = 6889;
	
#ifndef BOOST_NO_EXCEPTIONS
	try {
#endif
		switch(args.Length()) {
			case 2:
				// localhost, select the ports
				port1 = args[0]->ToInt32()->Value();
				port2 = args[1]->ToInt32()->Value();
				if(port1 < 6000 || port2 < 6000) {
					return VException("ports given can not be less than 6000");
				}
				
			default: break;
				//return VException("args should be: [hostname] || [port1, port2] || [hostname, port1, port2]");
		}
		
		cur_session.set_alert_mask(libtorrent::alert::all_categories);
		cur_session.listen_on(std::make_pair(port1, port2));
		cur_session.start_upnp();
		cur_session.start_natpmp();
		cur_session.start_lsd();
		cur_session.start_dht();
		cur_session.add_dht_router(std::make_pair("router.bitorrent.com", 6881));
		cur_session.add_dht_node(std::make_pair("192.168.1.34", 6881));
		cur_session.add_extension(&libtorrent::create_metadata_plugin);
		//cur_session.add_extension(&libtorrent::create_ut_metadata_plugin);
		cur_session.add_extension(&libtorrent::create_ut_pex_plugin);
		cur_session.add_extension(&libtorrent::create_smart_ban_plugin);
		/*cur_session.set_alert_mask(libtorrent::alert::error_notification |
									libtorrent::alert::storage_notification |
									libtorrent::alert::status_notification |
									libtorrent::alert::progress_notification |
									libtorrent::alert::performance_warning |
									libtorrent::alert::dht_notification);*/
		
		
#ifndef BOOST_NO_EXCEPTIONS
	} catch(std::exception& e) {
		std::cerr << e.what() << "\n";
		std::string const *stack = boost::get_error_info<stack_error_info>(e);
		if(stack) {                    
			std::cerr << stack << std::endl;
		}
		
		return False();
	}
#endif
	
	return True();
}

Handle<Value> Playbox::stop(const Arguments &args)
{
	// stop listening
	//cur_session.pause();
	return Undefined();
}

Handle<Value> Playbox::archive(const Arguments &args)
{
	HandleScope scope;
	
	Local<Object> result = Object::New();
	result->Set(String::New("get"), args[0]->ToString());
	
	return scope.Close(result);
}


static Handle<Value> entry_to_json(libtorrent::entry e) {
	using namespace boost;
	using namespace libtorrent;
	
	switch(e.type()) {
		case entry::int_t: {
			return Integer::New(e.integer());
		} case entry::string_t: {
			Local<String> s = String::New(e.string().c_str());
			return ;
		} case entry::list_t: {
			entry::list_type& l = e.list();
			Local<Array> arr = Array::New(l.size());
			
			uint32_t idx = 0;
			for(entry::list_type::const_iterator i = l.begin(); i != l.end(); ++i) {
				arr->Set(idx++, entry_to_json(*i));
			}
			
			return arr;
			
		} case entry::dictionary_t: {
			entry::dictionary_type& dict = e.dict();
			Local<Object> obj = Object::New();
			for(entry::dictionary_type::const_iterator i = dict.begin(); i != dict.end(); ++i) {
				obj->Set(String::NewSymbol((*i).first.c_str()), entry_to_json((*i).second));
			}
			
			return obj;
			
		} default: break;
	}
	
	return Undefined();
}

static void print_progress(int i, int num)
{
	//usleep(100);
	//std::cout << "\r" << (i+1) << "/" << num;
}

Handle<Value> Playbox::make_archive_torrent(const Arguments &args)
{
	if(args.Length() != 1 || !args[0]->IsString()) {
		return ThrowException(Exception::Error(String::New("Must provide a file path as a string")));
    }
    
	String::Utf8Value archive_path(args[0]->ToString());
	std::string str_path(*archive_path);
	filesystem::path path(filesystem::complete(str_path));
	
	String::Utf8Value archive_real_path(args[1]->ToString());
	std::string str_real_path(*archive_real_path);
	filesystem::path real_path(filesystem::complete(str_real_path));
	
	using namespace boost;
	using namespace libtorrent;
	
	libtorrent::file_storage fs;
	libtorrent::file_pool fp;
	
#ifndef BOOST_NO_EXCEPTIONS
	try {
#endif
		//======
		// build the file list
		std::time_t mtime = filesystem::last_write_time(path);
		uintmax_t size = filesystem::file_size(path);
		fs.add_file(path.filename(), size, 0, mtime);
		fs.set_name(real_path.filename());
		
		//======
		// begin hash generation
		create_torrent torrent(fs, 16 * 1024, -1, 1 /*+ 2*/ + 8 /* optimize + merkle + symlink */); // should be 11, removed merkle
		libtorrent::file_storage cur_fs(torrent.files());
		//cur_fs.rename_file(0, path.filename());
		torrent.set_creator("playbox-2.0");
		torrent.set_comment("torrent created by playbox-2.0");
		
		//======
		// compute the hashes
		libtorrent::set_piece_hashes(torrent, path.branch_path().string(), boost::bind(&print_progress, _1, torrent.num_pieces()));
		std::cerr << std::endl;
		//cur_fs.rename_file(0, std::string(real_path.filename()));
		
		//======
		// generate the torrent & file hashes
		libtorrent::entry metadata = entry(torrent.generate());
		
		//======
		// add the real file path to the torrent (to know that it's not in the library)
		//metadata["media_path"] = entry(std::string(path.filename()));
		
		//dictionary_type& dict = metadata.dict();
		
		Handle<Value> meta = entry_to_json(metadata);
		return meta;
		
#ifndef BOOST_NO_EXCEPTIONS
	} catch (std::exception& e) {
		return ThrowException(Exception::Error(String::New(e.what())));
	}
#endif
	
	return Undefined();
}

Handle<Value> Playbox::load_torrent(const Arguments &args)
{
	if(args.Length() != 1 || !args[0]->IsString()) {
		return ThrowException(Exception::Error(String::NewSymbol("load_torrent expects a bencoded string")));
	}
	
	libtorrent::lazy_entry metadata;
	libtorrent::error_code ec;
	String::Utf8Value bencoded_string(args[0]->ToString());
	int pos;
	
	if(*bencoded_string == NULL || libtorrent::lazy_bdecode(*bencoded_string, (*bencoded_string) + bencoded_string.length(), metadata, ec, &pos, 55, 1111) != 0) {
		return ThrowException(Exception::Error(String::NewSymbol("string unable to be decoded")));
	}
	
#ifndef BOOST_NO_EXCEPTIONS
	try {
#endif
		//======
		// add_torrent parameters
		std::string hash;
		std::string local_file;
		libtorrent::add_torrent_params params;
		params.duplicate_is_error = false;
		params.storage_mode = libtorrent::storage_mode_allocate;
		params.save_path = library_dir;
		
		//======
		// check to see if the media_path exists
		bool use_local_file = false;
		std::string media_path(metadata.dict_find_string_value("media_path"));
		if(media_path.length()) {
			if(filesystem::exists(media_path)
				/*&& is a valid media file */) {
				filesystem::path media_path_path(media_path);
				std::string library_sym(media_path + "/" + hash);
				params.save_path = filesystem::path(media_path_path.branch_path().string()).string();
				use_local_file = true;
				if(!filesystem::exists(library_sym) && symlink(media_path.c_str(), library_sym.c_str()) != 0) {
					std::cerr << "symlink could not be created" << std::endl;
				}
			} else {
				std::cerr << "media path does not exist: " << media_path << std::endl;
			}
		} else {
			std::cerr << "media path not found " << metadata.type() << std::endl;
		}
		
		if(!use_local_file) {
			params.save_path = library_dir;
		}
		
		//======
		// load up the torrent info into the params
		//torrent_info* ti = new torrent_info(metadata);
		local_file = params.save_path + "/";
		libtorrent::torrent_info* ti = new libtorrent::torrent_info(metadata, 0);
		if(ti) {
			hash = lexical_cast<std::string>(ti->info_hash());
		
			if(use_local_file) {
				const std::string filename(ti->name());
				ti->rename_file(0, filename);
				local_file += filename;
			} else {
				ti->rename_file(0, hash);
				local_file += hash;
			}
			
			//js_metadata = extract_metadata(hash, local_file, metadata);
			params.ti = ti;
		}
		
		// if no media data is found, grab the id3 info!
		
		// now, verify that the file is indeed a media file
		
		
		std::cerr << "loading torrent... " << hash << " " << params.save_path << " " << filesystem::exists(params.save_path) << std::endl;
		libtorrent::torrent_handle handle = cur_session.add_torrent(params);
		
		// I can't really imagine code any uglier
		libtorrent::entry meta_entry;
		meta_entry = implicit_cast<libtorrent::lazy_entry const&>(metadata);
		hash = lexical_cast<std::string>(handle.info_hash());
		Handle<Value> js_metadata = entry_to_json(meta_entry);
		Local<Value> event_args[2];
		
		
		event_args[0] = Local<Value>::New(String::New(hash.c_str()));
		event_args[1] = Local<Value>::New(js_metadata);
		playbox->Emit(symbol_archiveLoaded, 2, event_args);
		
		
#ifndef BOOST_NO_EXCEPTIONS
	} catch (std::exception& e) {
		return ThrowException(Exception::Error(String::NewSymbol(e.what())));
	}
#endif
	
	
	// lazy_decode it and throw error if failed
	// load the torrent
	
	return Undefined();
}

Handle<Value> Playbox::add_archive_metadata(const Arguments &args)
{
	if(args.Length() == 0 || !args[0]->IsString()) {
		return ThrowException(Exception::Error(String::NewSymbol("Must provide a file path as a string")));
    }
    
	String::Utf8Value archive_path(args[0]->ToString());
	Playbox::load_torrent(std::string(*archive_path));
	return Undefined();
}

Handle<Value> Playbox::get_archive_metadata(const Arguments &args)
{
	if(args.Length() == 0 || !args[0]->IsString()) {
		return ThrowException(Exception::Error(String::New("Must provide a file path as a string")));
    }
    
	String::Utf8Value archive_path(args[0]->ToString());
	std::string local_file(*archive_path);
	
	std::string title;
	std::string status;
	std::string value;
	
	int err;
	const char* filename = (local_file).c_str();
	Local<Object> result = Object::New();
	
	AVFormatContext *fmt_ctx = avformat_alloc_context();
	AVInputFormat *iformat = NULL;
	
	if(!filesystem::exists(local_file)) {
		std::cerr << " [!] file does not exist" << std::endl;
	//} else if(filesystem::file_size(local_file) > 20*1024*1024) {
	//	std::cerr << "file to large" << std::endl;
	} else if((err = av_open_input_file(&fmt_ctx, filename, iformat, 4096, NULL)) < 0) {
		switch(err) {
			case AVERROR_INVALIDDATA:
			std::cerr << " [W] invalid metadata (" << err << ") " << std::endl;
			break;
			
			case AVERROR_IO:
			std::cerr << " [W] metadata io error (" << err << ") " << std::endl;
			break;
			
			case AVERROR_NOENT:
			std::cerr << " [W] NOENT: file does not exist (" << err << ") " << std::endl;
			break;
			
			case AVERROR_NOFMT:
			std::cerr << " [W] metadata no format information (" << err << ") " << std::endl;
			break;
			
			case AVERROR_NOMEM:
			std::cerr << " [W] metadata extraction ran out of memory (" << err << ") " << std::endl;
			break;
			
			case AVERROR_NOTSUPP:
			std::cerr << " [W] metadata information not supported (" << err << ") " << std::endl;
			break;
			
			case AVERROR_NUMEXPECTED:
			std::cerr << " [W] metadata NUMEXPECTED (" << err << ") " << std::endl;
			break;
			
			default:
			std::cerr << " [W] metadata error UNKNOWN (" << err << ") " << std::endl;
			break;
		}
		//print_error()
	} else if((err = av_find_stream_info(fmt_ctx)) < 0) {
		std::cerr << "stream could not be found" << std::endl;
	}
	
	//av_metadata_conv(fmt_ctx, NULL, fmt_ctx->iformat->metadata_conv);
	
	AVStream *stream = fmt_ctx->streams[0];
	AVCodecContext *dec_ctx;
	//AVCodec *dec;
	if((dec_ctx = stream->codec)) {
		result->Set(String::NewSymbol("format"), String::New(fmt_ctx->iformat->name));
		switch (dec_ctx->codec_type) {
			case AVMEDIA_TYPE_VIDEO:
				value = "video";
				result->Set(String::NewSymbol("width"), Integer::New(dec_ctx->width));
				result->Set(String::NewSymbol("height"), Integer::New(dec_ctx->height));
				break;
		
			case AVMEDIA_TYPE_AUDIO:
				value = "audio";
				result->Set(String::NewSymbol("bitrate"), Integer::New(dec_ctx->bit_rate));
				result->Set(String::NewSymbol("channels"), Integer::New(dec_ctx->channels));
				result->Set(String::NewSymbol("sample_rate"), Integer::New(dec_ctx->sample_rate));
				//result->Set(String::New("codec"), String::New((dec = dec_ctx->codec) != NULL ? dec->name : "unknown"));
				break;
		
			default:
				value = "unknown";
		}
	
		result->Set(String::NewSymbol("type"), String::New(value.c_str()));
	
		// time
		if(fmt_ctx->duration > 0) {
			result->Set(String::NewSymbol("time"), Number::New(fmt_ctx->duration / AV_TIME_BASE));
		}
		
		AVMetadataTag *tag = NULL;
		while((tag = av_metadata_get(fmt_ctx->metadata, "", tag, AV_METADATA_IGNORE_SUFFIX))) {
			std::string key(tag->key);
			std::string val(tag->value);
			if((val = trim(val)).length() > 0) {
				result->Set(String::NewSymbol(trim(key).c_str()), String::New(tag->value));
			}
		}
	} else {
		
	}
	
	av_close_input_file(fmt_ctx);
	
	result->Set(String::NewSymbol("name"), String::New(xml_special_chars(title.length() ? title : filesystem::path(local_file).stem()).c_str()));
	return result;
}


static std::string xml_special_chars(std::string str)
{
	std::string::iterator it_end = str.end();
	size_t i = 0;
	for(std::string::iterator it = str.begin(); it < it_end; ++it, i++) {
		switch(it[0]) {
		case '&':
			str.replace(i, 1, "&amp;");
			break;
			
		case '"':
			str.replace(i, 1, "&quot;");
			break;
			
		case '<':
			str.replace(i, 1, "&lt;");
			break;
			
		case '>':
			str.replace(i, 1, "&gt;");
			break;
		}
	}
	
	return str;
}

// make a function called "load_torrent" which looks in the .torrents/ dir
// if it is not in the cache, grab it from the fs, else look on DHT
Handle<Value> Playbox::update(const Arguments &args)
{
	std::auto_ptr<libtorrent::alert> alert;
	while((alert = cur_session.pop_alert()).get() != NULL) {
		int type = (*alert).type();
		Persistent<String>* symbol;
		Local<Object> extra = Object::New();
		Local<Value> args[2];
		args[1] = extra;
		std::string hash;
		
		switch(type) {
			case libtorrent::torrent_finished_alert::alert_type:
			case libtorrent::torrent_deleted_alert::alert_type:
			case libtorrent::torrent_paused_alert::alert_type:
			case libtorrent::torrent_resumed_alert::alert_type:
			case libtorrent::metadata_failed_alert::alert_type:
			case libtorrent::metadata_received_alert::alert_type:
			case libtorrent::state_changed_alert::alert_type:
				if(libtorrent::torrent_finished_alert* p = libtorrent::alert_cast<libtorrent::torrent_finished_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &symbol_archiveComplete;
				} else if(libtorrent::torrent_deleted_alert* p = libtorrent::alert_cast<libtorrent::torrent_deleted_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &symbol_archiveRemoved;
				} else if(libtorrent::torrent_paused_alert* p = libtorrent::alert_cast<libtorrent::torrent_paused_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &symbol_archivePaused;
				} else if(libtorrent::torrent_resumed_alert* p = libtorrent::alert_cast<libtorrent::torrent_resumed_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &symbol_archiveResumed;
				} else if(libtorrent::metadata_failed_alert* p = libtorrent::alert_cast<libtorrent::metadata_failed_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &symbol_archiveUnknown;
				//} else if(libtorrent::metadata_received_alert* p = libtorrent::alert_cast<libtorrent::metadata_received_alert>(alert.get())) {
					//hash = lexical_cast<std::string>(p->handle.info_hash());
					//symbol = &symbol_archiveLoaded;
				} else if(libtorrent::state_changed_alert* p = libtorrent::alert_cast<libtorrent::state_changed_alert>(alert.get())) {
					std::string prev_state;
					std::string state;
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &symbol_stateChange;
					switch(p->prev_state) {
						case libtorrent::torrent_status::checking_files:
						case libtorrent::torrent_status::queued_for_checking:
						case libtorrent::torrent_status::checking_resume_data:
							prev_state = "CHECKING";
							break;
						
						case libtorrent::torrent_status::downloading_metadata:
							prev_state = "DOWNLOADING_METADATA";
							break;
							
						case libtorrent::torrent_status::allocating:
						case libtorrent::torrent_status::downloading:
							prev_state = "DOWNLOADING";
							break;
							
						case libtorrent::torrent_status::finished:
						case libtorrent::torrent_status::seeding:
							prev_state = "OK";
							p->handle.super_seeding(true);
							p->handle.force_dht_announce();
							printf("super seeding %d\n", p->handle.super_seeding());
							break;
					}
					
					switch(p->state) {
						case libtorrent::torrent_status::checking_files:
						case libtorrent::torrent_status::queued_for_checking:
						case libtorrent::torrent_status::checking_resume_data:
							state = "CHECKING";
							break;
						
						case libtorrent::torrent_status::downloading_metadata:
							state = "DOWNLOADING_METADATA";
							//p->handle.set_
							break;
							
						case libtorrent::torrent_status::allocating:
						case libtorrent::torrent_status::downloading:
							state = "DOWNLOADING";
							break;
							
						case libtorrent::torrent_status::finished:
						case libtorrent::torrent_status::seeding:
							state = "OK";
							break;
					}
					
					if(prev_state == state) {
						continue;
					}
					
					extra->Set(String::NewSymbol("prev_state"), String::New(prev_state.c_str()));
					extra->Set(String::NewSymbol("state"), String::New(state.c_str()));
					
#ifndef ENABLE_WARNINGS
				} else {
					// some sort of error
					continue;
#endif
				}
				
				args[0] = Local<Value>::New(String::New(hash.c_str()));
				playbox->Emit(*symbol, 2, args);
				break;
			
			case libtorrent::listen_failed_alert::alert_type:
			case libtorrent::listen_succeeded_alert::alert_type:
				if(libtorrent::listen_succeeded_alert* p = libtorrent::alert_cast<libtorrent::listen_succeeded_alert>(alert.get())) {
					symbol = &symbol_listening;
				} else if(libtorrent::listen_failed_alert* p = libtorrent::alert_cast<libtorrent::listen_failed_alert>(alert.get())) {
					symbol = &symbol_listeningFailed;
#ifndef ENABLE_WARNINGS
				} else {
					// putos warnings de mierda! should never get here
					continue;
#endif
				}
				
				//args[0] = Local<Value>::New(String::New(hash.c_str()));
				args[0] = extra;
				playbox->Emit(*symbol, 1, args);
				break;
				
			default:
				//std::cout << "alert: " << (*alert).type() << ": " << (*alert).message() << std::endl;
				continue;
			
		}
		
		std::cout << "g:alert: " << (*alert).type() << ": " << (*alert).message() << std::endl;
	}
	
	return Undefined();
}


void Playbox::load_torrent(const std::string path)
{
	using namespace boost;
	using namespace libtorrent;
	
	libtorrent::file_storage fs;
	libtorrent::file_pool fp;
	Local<Value> js_metadata = Local<Value>::New(Undefined());
	filesystem::path torrent_path(path);
	
#ifndef BOOST_NO_EXCEPTIONS
	try {
#endif
		//======
		// add_torrent parameters
		std::string hash;
		std::string local_file;
		libtorrent::add_torrent_params params;
		params.duplicate_is_error = false;
		params.storage_mode = libtorrent::storage_mode_allocate;
		params.save_path = library_dir;
		
		if(path.size() == 40
				&& path.find('/') == std::string::npos
				&& torrent_path.extension() != ".torrent") {
			// this is a hash, not a file
			params.info_hash = lexical_cast<sha1_hash>(path);
			hash = path;
		} else {
			//======
			// check the file size, not to blow out the memory (2MB)
			int size = filesystem::file_size(path);
			if(size > 2 * 1024 * 1024) {
				std::cerr << "file too big! (" << size << "), aborting" << std::endl;
				return;
			}

			//======
			// stream the file in, and decode it			
			std::vector<char> buf(size);
			std::ifstream(path.c_str(), std::ios_base::binary).read(&buf[0], size);
			//entry metadata = bdecode(&buf[0], &buf[0] + buf.size());
			lazy_entry metadata;
			boost::system::error_code ec;
			int pos;
			if(lazy_bdecode(&buf[0], &buf[0] + buf.size(), metadata, ec, &pos, 10, 1000)) {
				std::cerr << "invalid bencoding: " << ec << std::endl;
				// unlink the file
				return;
			}
			
			//======
			// check to see if the media_path exists
			bool use_local_file = false;
			std::string media_path(metadata.dict_find_string_value("media_path"));
			if(media_path.length()) {
				if(filesystem::exists(media_path)
					/*&& is a valid media file */) {
					filesystem::path media_path_path(media_path);
					std::string library_sym(media_path + "/" + hash);
					params.save_path = filesystem::path(media_path_path.branch_path().string()).string();
					use_local_file = true;
					if(!filesystem::exists(library_sym) && symlink(media_path.c_str(), library_sym.c_str()) != 0) {
						std::cerr << "symlink could not be created" << std::endl;
					}
				} else {
					std::cerr << "media path does not exist: " << media_path << std::endl;
				}
			} else {
				std::cerr << "media path not found " << metadata.type() << std::endl;
			}
			
			if(!use_local_file) {
				params.save_path = library_dir;
			}
			
			//======
			// load up the torrent info into the params
			//torrent_info* ti = new torrent_info(metadata);
			local_file = params.save_path + "/";
			torrent_info* ti = new torrent_info(metadata, 0);
			if(ti) {
				hash = lexical_cast<std::string>(ti->info_hash());
			
				if(use_local_file) {
					const std::string filename(ti->name());
					ti->rename_file(0, filename);
					local_file += filename;
				} else {
					ti->rename_file(0, hash);
					local_file += hash;
				}
				
				//js_metadata = extract_metadata(hash, local_file, metadata);
				params.ti = ti;
			}
			
			// if no media data is found, grab the id3 info!
			
			// now, verify that the file is indeed a media file
			
			//======
			// check for media metadata
			//torrents_metadata[hash] = entry(metadata);
		}
		
		std::cerr << "loading torrent... " << hash << " " << params.save_path << " " << filesystem::exists(params.save_path) << std::endl;
		libtorrent::torrent_handle handle = cur_session.add_torrent(params);
		
		hash = lexical_cast<std::string>(handle.info_hash());
		Local<Value> args[2];
		args[0] = Local<Value>::New(String::New(hash.c_str()));
		args[1] = js_metadata;
		playbox->Emit(symbol_archiveLoaded, 2, args);
		
		
#ifndef BOOST_NO_EXCEPTIONS
	} catch (std::exception& e) {
		std::cerr << e.what() << "\n";
		std::string const *stack = boost::get_error_info<stack_error_info>(e);
		if(stack) {                    
			std::cerr << stack << std::endl;
		}
	}
#endif
}

// Exporting function
extern "C" void init(Handle<Object> target)
{
	HandleScope scope;
	Playbox::Initialize(target);
	//Long::Initialize(target);
	//ObjectID::Initialize(target);
	//Binary::Initialize(target);
	//Code::Initialize(target);
	//DBRef::Initialize(target);
}

// NODE_MODULE(bson, BSON::Initialize);
// NODE_MODULE(l, Long::Initialize);
