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
#include <libtorrent/file.hpp>
#include <libtorrent/storage.hpp>
#include <libtorrent/hasher.hpp>
#include <libtorrent/create_torrent.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/alert.hpp>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/extensions/metadata_transfer.hpp>
#include <libtorrent/extensions/ut_metadata.hpp>

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>
#include <boost/filesystem/fstream.hpp>
#include <boost/bind.hpp>
#include <boost/lexical_cast.hpp>

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
static Local<Value> extract_metadata(const libtorrent::sha1_hash hash, const libtorrent::lazy_entry& metadata);
static std::string xml_special_chars(std::string str);

// static vars
static libtorrent::session cur_session;
static std::string library_path;
static std::string torrent_path;
//static std::map<std::string, libtorrent::lazy_entry> torrents_metadata;
static std::list<std::string> torrent_queue;
static Playbox *playbox;

// events
static Persistent<String> archiveUnknown = NODE_PSYMBOL("archiveUnknown");
static Persistent<String> archivePaused = NODE_PSYMBOL("archivePaused");
static Persistent<String> archiveResumed = NODE_PSYMBOL("archiveResumed");
static Persistent<String> archiveMetadata = NODE_PSYMBOL("archiveMetadata");
static Persistent<String> archiveDownloading = NODE_PSYMBOL("archiveDownloading");
static Persistent<String> archiveProgress = NODE_PSYMBOL("archiveProgress");
static Persistent<String> archiveComplete = NODE_PSYMBOL("archiveComplete");
static Persistent<String> archiveRemoved = NODE_PSYMBOL("archiveRemoved");


static Handle<Value> VException(const char *msg) {
	HandleScope scope;
	return ThrowException(Exception::Error(String::New(msg)));
};

static Handle<Value> __library_path(Local<String> property, const AccessorInfo& info) {
	return String::New(library_path.c_str());
}

static Handle<Value> __torrent_path(Local<String> property, const AccessorInfo& info) {
	return String::New(torrent_path.c_str());
}

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

void Playbox::Initialize(v8::Handle<v8::Object> target) {
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
	
	// adds a physical archive into the library
	NODE_SET_PROTOTYPE_METHOD(t, "add_archive", add_archive);
	
	// adds a physical torrent file into the library
	NODE_SET_PROTOTYPE_METHOD(t, "add_archive_metadata", add_archive_metadata);
	
	// run an update pass
	NODE_SET_PROTOTYPE_METHOD(t, "update", update);
	
	t->PrototypeTemplate()->SetAccessor(String::NewSymbol("library_path"), __library_path);
	t->PrototypeTemplate()->SetAccessor(String::NewSymbol("torrent_path"), __torrent_path);
	
	target->Set(String::NewSymbol("Playbox"), t->GetFunction());
	
	// ----------------
	
	playbox = new Playbox();
	
	// ----------------
	
	uid_t uid = getuid();
	struct passwd* user_passwd = getpwuid(uid);
	struct stat status;
	
	if(user_passwd) {
		library_path = user_passwd->pw_dir;
		library_path += "/Library";
		filesystem::create_directory(filesystem::path(::library_path));
		
		library_path += "/playbox";
		filesystem::create_directory(filesystem::path(::library_path));
		// now, chroot to the dir
		
		::torrent_path = std::string(::library_path).append("/.torrents/");
		filesystem::path p(torrent_path);
		if(filesystem::exists(p)) {
			std::cout << "torrent dir exists " << torrent_path << " .. beginning scan..." << std::endl;
			filesystem::directory_iterator end_itr;
			for(filesystem::directory_iterator itr(p); itr != end_itr; ++itr) {
				std::string filename = itr->filename();
				size_t len = filename.size();

				if(len > 8 && filename.substr(len - 8, 8) == ".torrent") {
					//std::cout << "TORRENT: " << filename << std::endl;
					//Playbox::load_media(itr->string());
				} else {
					std::cout << "FILE: " << filename << std::endl;
				}
			}
		} else {
			filesystem::create_directory(p);
		}
		
		
		// -------
		
		std::string music_dir(user_passwd->pw_dir);
		music_dir += "/Music";
		
		if(stat(music_dir.c_str(), &status) != -1) {
			// TODO!!!!! automatically add the music directory to the sources list
			Playbox::add_media(music_dir);
		}
	} else {
		// todo: move most of this into the constructor, and separate the static functions from the methods
		//return VException("playbox could not find the user's home directory! HUGE FAIL");
	}
}

// Create a new instance of BSON and assing it the existing context
Handle<Value> Playbox::New(const Arguments &args) {
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
				
			default:
				printf("connecting %d %d (%d)\n", port1, port2, args.Length());
				//return VException("args should be: [hostname] || [port1, port2] || [hostname, port1, port2]");
		}
		
		printf("starting, listening: %d\n", cur_session.is_listening());
		cur_session.listen_on(std::make_pair(port1, port2));
		cur_session.add_dht_router(std::make_pair("router.bitorrent.com", 6881));
		//cur_session.add_dht_node(std::make_pair("192.168.1.37", 6881));
		cur_session.start_dht();
		cur_session.start_upnp();
		cur_session.start_natpmp();
		cur_session.start_lsd();
		cur_session.add_extension(&libtorrent::create_metadata_plugin);
		cur_session.add_extension(&libtorrent::create_ut_metadata_plugin);
		//cur_session.set_alert_mask(libtorrent::alert::all_categories);
		cur_session.set_alert_mask(libtorrent::alert::error_notification |
									libtorrent::alert::storage_notification |
									libtorrent::alert::status_notification |
									libtorrent::alert::progress_notification |
									libtorrent::alert::performance_warning |
									libtorrent::alert::dht_notification);
	
#ifndef BOOST_NO_EXCEPTIONS
	} catch(std::exception& e) {
		std::cerr << e.what() << "\n";
		std::string const *stack = boost::get_error_info<stack_error_info>(e);
		if(stack) {                    
			std::cout << stack << std::endl;
		}
		
		return False();
	}
#endif
	
	return True();
}

Handle<Value> Playbox::stop(const Arguments &args) {
	// stop listening
	//cur_session.pause();
	return Undefined();
}

Handle<Value> Playbox::archive(const Arguments &args) {
	HandleScope scope;
	
	Local<Object> result = Object::New();
	result->Set(String::New("get"), args[0]->ToString());
	
	return scope.Close(result);
}

Handle<Value> Playbox::add_archive(const Arguments &args) {
	if(args.Length() == 0 || !args[0]->IsString()) {
		return ThrowException(Exception::Error(String::New("Must provide a file path as a string")));
    }
    
	String::Utf8Value archive_path(args[0]->ToString());
	Playbox::add_media(std::string(*archive_path));
	return Undefined();
}

Handle<Value> Playbox::add_archive_metadata(const Arguments &args) {
	if(args.Length() == 0 || !args[0]->IsString()) {
		return ThrowException(Exception::Error(String::New("Must provide a file path as a string")));
    }
    
	String::Utf8Value archive_path(args[0]->ToString());
	Playbox::load_media(std::string(*archive_path));
	return Undefined();
}

/*
Handle<Value> Playbox::settings(const Arguments &args) {
	HandleScope scope;
	
	Local<Object> result = Object::New();
	result->Set(String::New("library_path"), String::New(library_path.c_str()));
	result->Set(String::New("torrent_path"), String::New(torrent_path.c_str()));
	
	return scope.Close(result);
}
*/

static Local<Value> extract_metadata(const libtorrent::sha1_hash sha1_hash, const libtorrent::lazy_entry& metadata) {
	std::string title;
	std::string status;
	std::string value;
	std::string hash(lexical_cast<std::string>(sha1_hash));
	
	Local<Object> result = Object::New();
	result->Set(String::New("id"), String::New(hash.c_str()));
	
	std::cout << "hash: " << hash << std::endl;
	//libtorrent::torrent_handle h_torrent = cur_session.find_torrent(sha1_hash);
	/*if(h_torrent.is_valid()) {
		status = "valid";
		
		libtorrent::torrent_status status = h_torrent.status();
		filesystem::path path(h_torrent.save_path());
		std::cout << hash << std::endl;
		//std::cout << "status: " << (int)status.state << " " << libtorrent::torrent_status::finished << std::endl;
		//std::cout << "paused: " << cur_session.is_paused() << " " << h_torrent.is_paused() << std::endl;
		//std::cout << "progress: " << status.progress_ppm << std::endl;
		//std::cout << "complete: " << status.num_complete << " " << status.num_complete << " " << status.total_done << std::endl;
		//std::cout << "error: " << status.error << std::endl;
		
		const libtorrent::torrent_info& ti = h_torrent.get_torrent_info();
		const libtorrent::file_entry file = ti.file_at(0);
		//std::cout << "path: " << path << file.path << " " << filesystem::exists(path.string() + "/" + file.path.string()) << std::endl;
		//if(h_torrent.is_paused()) {
			// only for when streaming
				//h_torrent.set_sequential_download(true);
			//h_torrent.force_recheck();
			//h_torrent.super_seeding(true);
			//h_torrent.resume();
		//}
	} else {
		std::cout << "invalid torrent: " << hash << std::endl;
		status = "invalid";
	}*/
	
	// print out the torrent status ..
	// 0-100 - file is downloading and that's the current percentage
	// LOOKUP - torrent has is trying to be located
	// OK - file exists and all parts are good
	// MISSING - file is missing entirely
	result->Set(String::New("status"), String::New(status.c_str()));
	
	value = metadata.dict_find_string_value("media_time");
	if(value.length()) {
		result->Set(String::New("time"), String::New(value.c_str()));
	}
	
	value = metadata.dict_find_string_value("media_year");
	if(value.length()) {
		result->Set(String::New("year"), String::New(value.c_str()));
	}
	
	value = metadata.dict_find_string_value("media_album");
	if(value.length()) {
		result->Set(String::New("album"), String::New(value.c_str()));
	}
	
	value = metadata.dict_find_string_value("media_artist");
	if(value.length()) {
		result->Set(String::New("artist"), String::New(value.c_str()));
		title += value;
	}
	
	value = metadata.dict_find_string_value("media_title");
	if(value.length()) {
		result->Set(String::New("title"), String::New(value.c_str()));
		if(title.length()) {
			title += " - ";
		}
		
		title += value;
	}
	
	result->Set(String::New("name"), String::New(xml_special_chars(title.length() ? title : "unknown").c_str()));
	return result;
}


static std::string xml_special_chars(std::string str) {
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
Handle<Value> Playbox::update(const Arguments &args) {
	std::auto_ptr<libtorrent::alert> alert;
	while((alert = cur_session.pop_alert()).get() != NULL) {
		int type = (*alert).type();
		switch(type) {
			case libtorrent::torrent_finished_alert::alert_type:
			case libtorrent::torrent_deleted_alert::alert_type:
			case libtorrent::torrent_paused_alert::alert_type:
			case libtorrent::torrent_resumed_alert::alert_type:
			case libtorrent::metadata_failed_alert::alert_type:
			case libtorrent::metadata_received_alert::alert_type:
				std::string hash;
				Persistent<String>* symbol;
				Local<Value> args[2];
				Local<Object> extra = Object::New();
				
				if(libtorrent::torrent_finished_alert* p = libtorrent::alert_cast<libtorrent::torrent_finished_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &archiveComplete;
				} else if(libtorrent::torrent_deleted_alert* p = libtorrent::alert_cast<libtorrent::torrent_deleted_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &archiveRemoved;
				} else if(libtorrent::torrent_paused_alert* p = libtorrent::alert_cast<libtorrent::torrent_paused_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &archivePaused;
				} else if(libtorrent::torrent_resumed_alert* p = libtorrent::alert_cast<libtorrent::torrent_resumed_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &archiveResumed;
				} else if(libtorrent::metadata_failed_alert* p = libtorrent::alert_cast<libtorrent::metadata_failed_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &archiveUnknown;
				} else if(libtorrent::metadata_received_alert* p = libtorrent::alert_cast<libtorrent::metadata_received_alert>(alert.get())) {
					hash = lexical_cast<std::string>(p->handle.info_hash());
					symbol = &archiveMetadata;
				} else {
					// some sort of error
					continue;
				}
				
				args[0] = Local<Value>::New(String::New(hash.c_str()));
				args[1] = extra;
				playbox->Emit(*symbol, 2, args);
				break;
			
			//case libtorrent::listen_failed_alert::alert_type:
			//case libtorrent::listen_succeeded_alert::alert_type:
			//	printf("LISTENING\n");
			//break;
			
		}
		
		//std::cout << "alert: " << (*alert).type() << ": " << (*alert).message() << std::endl;
	}
	
	return Undefined();
}


static void print_progress(int i, int num) {
	usleep(100);
	std::cerr << "\r" << (i+1) << "/" << num;
}

void Playbox::load_media(const std::string torrent_path) {
	using namespace boost;
	using namespace libtorrent;
	
	libtorrent::file_storage fs;
	libtorrent::file_pool fp;
	
	filesystem::path torrent_file(torrent_path);
	
#ifndef BOOST_NO_EXCEPTIONS
	try {
#endif
		//======
		// add_torrent parameters
		std::string hash;
		libtorrent::add_torrent_params params;
		params.duplicate_is_error = false;
		params.storage_mode = libtorrent::storage_mode_allocate;
		params.save_path = library_path;
		
		if(torrent_path.size() == 40
				&& torrent_path.find('/') == std::string::npos
				&& torrent_file.extension() != ".torrent") {
			// this is a hash, not a file
			params.info_hash = lexical_cast<sha1_hash>(torrent_path);
			hash = torrent_path;
		} else {
			//======
			// check the file size, not to blow out the memory (2MB)
			int size = filesystem::file_size(torrent_path);
			if(size > 2 * 1024 * 1024) {
				std::cerr << "file too big! (" << size << "), aborting" << std::endl;
				return;
			}

			//======
			// stream the file in, and decode it			
			std::vector<char> buf(size);
			std::ifstream(torrent_path.c_str(), std::ios_base::binary).read(&buf[0], size);
			//entry metadata = bdecode(&buf[0], &buf[0] + buf.size());
			lazy_entry metadata;
			boost::system::error_code ec;
			int pos;
			if(lazy_bdecode(&buf[0], &buf[0] + buf.size(), metadata, ec, &pos, 3, 100)) {
				std::cerr << "invalid bencoding: " << ec << std::endl;
				// unlink the file
				return;
			}
			
			//======
			// check to see if the media_path exists
			std::string media_path(metadata.dict_find_string_value("media_path"));
			//libtorrent::entry const* media_path_entry = metadata.find_key("media_path");
			bool use_local_file = false;
			if(media_path.length()) {
				if(filesystem::exists(media_path)
					/*&& is a valid media file */) {
					filesystem::path media_path_path(media_path);
					std::string library_sym(media_path + "/" + hash);
					params.save_path = filesystem::path(media_path_path.branch_path().string() + "/").string();
					use_local_file = true;
					if(!filesystem::exists(library_sym)) {
						if(symlink(media_path.c_str(), library_sym.c_str()) != 0) {
							//perror("symlink(MediaPath)");
							//return;
						}
					}
				}
			}
			
			if(!use_local_file) {
				params.save_path = library_path;
			}
			
			//======
			// load up the torrent info into the params
			//torrent_info* ti = new torrent_info(metadata);
			torrent_info* ti = new torrent_info(metadata, 0);
			if(ti) {
				hash = lexical_cast<std::string>(ti->info_hash());
				extract_metadata(ti->info_hash(), metadata);
			
				if(use_local_file) {
					//std::cout << "renaming to file: " << (ti->name()) << std::endl;
					const std::string filename(ti->name());
					ti->rename_file(0, filename);
				} else {
					//std::cout << "renaming to hash: " << hash << std::endl;
					ti->rename_file(0, hash);
				}
				
				params.ti = ti;
			}
			
			// if no media data is found, grab the id3 info!
			
			// now, verify that the file is indeed a media file
			
			//======
			// check for media metadata
			//torrents_metadata[hash] = entry(metadata);
		}
		
		std::cerr << "loading torrent... " << hash << " " << params.save_path << " " << filesystem::exists(params.save_path) << std::endl;
		cur_session.add_torrent(params);
		
#ifndef BOOST_NO_EXCEPTIONS
	} catch (std::exception& e) {
		std::cout << e.what() << "\n";
		std::string const *stack = boost::get_error_info<stack_error_info>(e);
		if(stack) {                    
			std::cout << stack << std::endl;
		}
	}
#endif
}

// this creates a torrent for the file, and then creates a symlink in the directory
void Playbox::add_media(const std::string path) {
	using namespace boost;
	using namespace libtorrent;
	
	if(filesystem::is_directory(path)) {
		std::cout << "adding a directory: " << path << std::endl;
		
		//TODO: recurse the directory and add them one by one...
		filesystem::directory_iterator end_itr;
		for(filesystem::directory_iterator itr(path); itr != end_itr; ++itr) {
			std::string filename = itr->filename();
			if(filesystem::is_regular_file(itr->status()) && filename.substr(filename.length() - 4) == ".mp3") {
				//std::cout << "mp3! " << itr->filename() << std::endl;
				//Playbox::add_media(itr->string());
				torrent_queue.push_back(itr->string());
			} else if(filesystem::is_directory(itr->status())) {
				//std::cout << "dir " << itr->string() << std::endl;
				Playbox::add_media(itr->string());
			} else {
				std::cerr << "unknown file: " << itr->string() << std::endl;
			}
		}
		
		return;
	}
}
	
void Playbox::make_torrent(const std::string path) {
	using namespace boost;
	using namespace libtorrent;
	
	filesystem::path media_path(path);
	libtorrent::file_storage fs;
	libtorrent::file_pool fp;
	
#ifndef BOOST_NO_EXCEPTIONS
	try {
#endif
		//======
		// build the file list
		filesystem::path full_path = filesystem::complete(path);
		uintmax_t size = filesystem::file_size(media_path);
		std::time_t mtime = filesystem::last_write_time(full_path);
		fs.add_file(full_path.filename(), size, 0, mtime);
		
		//======
		// begin hash generation
		create_torrent torrent(fs, 16 * 1024, -1, 9 /* optimize + merkle + symlink */); // should be 11, removed merkle
		torrent.set_creator("playbox-2.0");
		torrent.set_comment("torrent created by playbox-2.0");
		
		//======
		// compute the hashes
		std::cout << "set_piece_hashes(" << torrent.num_pieces() << ") " << full_path.string() << std::endl;
		libtorrent::set_piece_hashes(torrent, full_path.branch_path().string(), boost::bind(&print_progress, _1, torrent.num_pieces()));
		std::cerr << std::endl;
		
		//======
		// generate the torrent & file hashes
		// DELETE THIS SHIT, AND SEND AN EVENT THERE'S A NEW TORRENT
		libtorrent::entry metadata = entry(torrent.generate());
		
		//======
		// add the real file path to the torrent (to know that it's not in the library)
		metadata["media_path"] = entry(path);
		
		// output the metadata to a buffer
		std::vector<char> buffer;
		bencode(std::back_inserter(buffer), metadata);
		torrent_info ti(&buffer[0], buffer.size());
		buffer.clear();
		
		//======
		// generate the filename based on the info hash
		std::string torrent_file(torrent_path);
		std::string hash(lexical_cast<std::string>(ti.info_hash()));
		torrent_file.append(hash);
		torrent_file.append(".torrent");
		
		//======
		// emit an event saying there's a new torrent available!
		// TODO
		
		//======
		// add a symlink in the library to the real file
		std::string file_path(library_path + '/' + hash);
		//unlink(file_path.c_str());
		if(!filesystem::exists(file_path)) {
			if(symlink(path.c_str(), file_path.c_str()) != 0) {
				perror("symlink(MusicDirectory)");
				return;
			}
		}
		
		//======
		// output the buffer to a file
		if(!filesystem::exists(torrent_file)) {
			filesystem::ofstream out(filesystem::complete(filesystem::path(torrent_file)), std::ios_base::binary);
			bencode(std::ostream_iterator<char>(out), metadata);
		}
		
		//torrents_metadata[hash] = entry(metadata);
		
		//======
		// load the torrent into the music dir
		//TODO
		//Playbox::load_media(torrent_file);
		
#ifndef BOOST_NO_EXCEPTIONS
	} catch (std::exception& e) {
		std::cerr << e.what() << "\n";
		std::string const *stack = boost::get_error_info<stack_error_info>(e);
		if(stack) {                    
			std::cout << stack << std::endl;
		}
	}
#endif
}

// Exporting function
extern "C" void init(Handle<Object> target) {
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
