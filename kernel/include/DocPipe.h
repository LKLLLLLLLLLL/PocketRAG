# pragma once
#include <filesystem>
#include <functional>

#include "SqliteConnection.h"
#include "VectorTable.h"
#include "TextSearchTable.h"
#include "Chunker.h"
#include "ONNXModel.h"

/*
This class handles the document processing pipeline.
It can update all embedding of given document.
It will not change document on the disk.
If document changed(new document, modified document, deleted document), you can instantiate this class and call process() method to update information in the database.

requires sqlite with documents table
"CREATE TABLE IF NOT EXISTS documents ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT, "
    "doc_name TEXT NOT NULL UNIQUE, "
    "last_modified INTEGER, "         // file's last modified timestamp
    "file_size INTEGER, "             // file size
    "content_hash TEXT, "                   // file content hash (optional)
    "last_checked INTEGER,"              // last checked timestamp, if checked time is newer, no need to calculate hash
");"
manges sqlite with chunks table
CREATE TABLE IF NOT EXISTS chunks (
    chunk_id INTEGER PRIMARY KEY AUTOINCREMENT, -- unique primary key for other tables(tect search table and vector table) to reference
    doc_id INTEGER NOT NULL,
    embedding_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,   -- index in one document with one embedding 
    content_hash TEXT NOT NULL, -- hash of the content and metadata
    begin_line INTEGER, 
    end_line INTEGER, 

    -- UNIQUE(doc_id, embedding_id, chunk_index),

    FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(embedding_id) REFERENCES embeddings(id) ON DELETE CASCADE
);

This class is a single threaded class, it is not thread safe.
*/
class DocPipe
{
public:
    enum class DocState {unchecked, modified, created, deleted, unchanged};
    
    class Progress;

    // A wrapper for embedding model, used to store the model and its parameters
    struct Embedding
    {
        int embeddingId;
        std::string embeddingName;
        int dimension;
        int inputLength;
        std::shared_ptr<EmbeddingModel> model;
    };

private:  
    std::string docName; // extract from path
    std::filesystem::path docPath; // full path
    DocState state = {DocState::unchecked};

    std::string docContent; // cache content, avoid file changed while processing, do not use this variable directly, use readDoc() instead
    bool contentCached = false;

    Chunker::docType docType; // document type, used to split the document

    int64_t docId = -1; // extract from sqlite, if deleted, set to -1

    SqliteConnection& sqlite;
    TextSearchTable& tTable;
    std::vector<std::shared_ptr<Embedding>> &embeddings; // embedding model, can be multiple models
    std::vector<std::shared_ptr<VectorTable>> &vTable;       // vector table, one table has one embedding model

    static const int maxUncheckedTime = 60 * 60 * 24; // max unchecked time, second, 1 day

    // read document from disk, and cache it
    std::string& readDoc();

    // update document in db
    void updateDoc(std::function<void(double)> callback, std::function<bool(void)> stopFlag);

    // add new document to db
    void addDoc(std::function<void(double)> callback, std::function<bool(void)> stopFlag);

    // delete document from db
    void delDoc(std::function<void(double)> callback);

    // update document to text search table and vector table
    void updateToTable(Progress &progress, std::function<bool(void)> stopFlag);

    // update one embedding to text search table and vector table
    void updateOneEmbedding(const std::string &content, std::shared_ptr<Embedding> &embedding, std::shared_ptr<VectorTable> &vectortable, Progress &progress, std::function<bool(void)> stopFlag);

    // update last_modified, last_checked, content_hash, file_size in sqlite
    void updateSqlite(std::string hash = "");

public:
    DocPipe(std::filesystem::path docPath, SqliteConnection &sqlite, TextSearchTable &tTable, std::vector<std::shared_ptr<VectorTable>> &vTable, std::vector<std::shared_ptr<Embedding>> &embeddings);
    ~DocPipe() = default; 

    DocPipe(const DocPipe&) = delete; // disable copy constructor
    DocPipe& operator=(const DocPipe&) = delete; // disable copy assignment operator

    DocPipe(DocPipe&&) = default; // enable move constructor
    DocPipe& operator=(DocPipe&&) = delete; // enable move assignment operator

    // check document status to get task type, but not process the task
    void check();

    // get doc state, call after check()
    DocState getState() const { return state; }

    // process the task, need callback function to report progress
    void process(std::function<void(double)> callback, std::function<bool(void)> stopFlag);

    // get docId
    int64_t getId() const { return docId; } 

    // get doc path
    std::string getPath() const { return docPath.string(); } // get doc path

};

/*
This class is used to report progress of the task.
*/
class DocPipe::Progress
{
private:
    std::function<void(double)> callback;              // callback function for progress
    double progress = 0.0;                             // progress value, range [0.0, 1.0]
    std::vector<std::pair<std::string, double>> steps; // config of steps name and steps length
    int currentStep = 0;                               // current step index

public:
    Progress(std::function<void(double)> callback) : callback(callback) {}
    Progress(std::function<void(double)> callback, std::vector<std::pair<std::string, double>> subProgress);

    void update(double progress);

    void updateSubprocess(double progress);

    void finishSubprogress();
    
};