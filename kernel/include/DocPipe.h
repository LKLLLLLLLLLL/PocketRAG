# pragma once
#include <iostream>
#include <filesystem>

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

    UNIQUE(doc_id, embedding_id, chunk_index),

    FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(embedding_id) REFERENCES embeddings(id) ON DELETE CASCADE
);
*/
class DocPipe
{
public:
    struct Exception : public std::exception
    {
        enum class Type {notFound, openError, sqlError, wrongArg, unknownError};
        Type type; // type of the exception
        std::string message; // error message

        Exception(Type type, const std::string &message) : type(type), message(message) {}
        const char* what() const noexcept override { return message.c_str(); } // override what() method
    };

private:
    enum class taskType {check, add, del};
    
    std::string docName; // extract from path
    std::filesystem::path docPath; // full path
    taskType type;

    Chunker::docType docType; // document type, used to split the document

    int64_t docId = -1; // extract from sqlite, if deleted, set to -1

    SqliteConnection& sqlite;
    TextSearchTable& tTable;
    std::vector<EmbeddingModel>& embdModel; // embedding model, can be multiple models
    std::vector<VectorTable> &vTable;       // vector table, one table has one embedding model

    static const int maxUncheckedTime = 60 * 60 * 24; // max unchecked time, second, 1 day

    // check if the document changed, if changed update db
    // this method can be called frquently, because it check quickly
    void checkDoc(); 

    // add new document to db
    void addDoc(); 

    // delete document from db
    void delDoc(); 

    // update document to text search table and vector table
    void updateToTable();

    // update one embedding to text search table and vector table
    void updateOneEmbedding(const std::string &content, EmbeddingModel &model, VectorTable &vectortable);

    // helper functions
    // calculate hash of the document
    static std::string calculateHash(const std::filesystem::path &path);
    static std::string calculateHash(const std::string &content);
    // update last_modified, last_checked, content_hash, file_size in sqlite
    void updateSqlite(std::string hash = "") const;

public:
    DocPipe(std::filesystem::path docPath, SqliteConnection &sqlite, TextSearchTable &tTable, std::vector<VectorTable> &vTable, std::vector<EmbeddingModel> &embdModel);
    ~DocPipe() = default; 

    DocPipe(const DocPipe&) = delete; // disable copy constructor
    DocPipe& operator=(const DocPipe&) = delete; // disable copy assignment operator

    // process the task
    void process();

    int64_t getId() const { return docId; } // get docId

};