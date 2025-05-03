#include "DocPipe.h"

#include <iostream>
#include <filesystem>
#include <chrono>
#include <format>
#include <xxhash.h>

#include "SqliteConnection.h"
#include "VectorTable.h"
#include "TextSearchTable.h"
#include "Chunker.h"
#include "ONNXModel.h"

DocPipe::DocPipe(std::filesystem::path docPath, SqliteConnection &sqlite, TextSearchTable &tTable, std::vector<VectorTable> &vTable, std::vector<EmbeddingModel> &embdModel) : docPath(docPath), sqlite(sqlite), vTable(vTable), tTable(tTable), embdModel(embdModel)
{
    // extract docName from docPath
    docName = docPath.filename().string();

    // check if the doeument exists
    if(!std::filesystem::exists(docPath))
    {
        type = taskType::del; // set to delete task
        return; 
    }

    // check if the document is a file
    if(!std::filesystem::is_regular_file(docPath))
        throw Exception(Exception::Type::notFound, "Document is not a file: " + docPath.string());
    
    // check if the document exists in the database
    auto stmt = sqlite.getStatement("SELECT id, last_modified, last_checked, content_hash FROM documents WHERE doc_name = ?");
    stmt.bind(1, docName);
    if (!stmt.step())
        type = taskType::add; // set to add task
    else
        type = taskType::check; // set to check task

    // get doc type
    auto fileType = docPath.extension().string(); // get document's type
    if (fileType == ".txt")
        docType = Chunker::docType::plainText;
    else if (fileType == ".md")
        docType = Chunker::docType::Markdown;
    else
        throw Exception(Exception::Type::wrongArg, "Unsupported document type: " + fileType);
}

void DocPipe::process()
{
    switch(type)
    {
        case taskType::check:
            checkDoc();
            break;
        case taskType::add:
            addDoc();
            break;
        case taskType::del:
            delDoc();
            break;
        default:
            throw Exception(Exception::Type::unknownError, "Unknown task type: " + std::to_string(static_cast<int>(type)));
    }
}

void DocPipe::checkDoc()
{
    // get docId, last_modified time, last_checked time, content_hash from documents table
    auto stmt = sqlite.getStatement("SELECT id, last_modified, last_checked, content_hash FROM documents WHERE doc_name = ?");
    stmt.bind(1, docName);
    if(!stmt.step())
        throw Exception(Exception::Type::notFound, "Document not found in database: " + docName);

    docId = stmt.get<int64_t>(0); 
    auto lastModified = stmt.get<int64_t>(1);
    auto lastChecked = stmt.get<int64_t>(2);
    auto contentHash = stmt.get<std::string>(3);

    // quick check if the document is changed
    auto lastModifiedTime = std::filesystem::last_write_time(docPath);
    auto lastModifiedTimeInt = std::chrono::duration_cast<std::chrono::seconds>(lastModifiedTime.time_since_epoch()).count();
    if(lastModifiedTimeInt != lastModified)
    {
        updateToTable();
        updateSqlite();
        return;
    }

    auto now = std::chrono::system_clock::now();
    auto nowInt = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
    if(nowInt - lastChecked <= maxUncheckedTime)
    {
        return; // no need to check again
    }

    // deep check if the document is changed
    auto hash = calculateHash(docPath);
    if(hash != contentHash)
    {
        updateToTable();
        updateSqlite(hash);
        return;
    }

    return; // no need to update
}

void DocPipe::delDoc()
{
    // get docId from documents table
    auto stmt = sqlite.getStatement("SELECT id FROM documents WHERE doc_name = ?;");
    stmt.bind(1, docName);
    if (!stmt.step())
        throw Exception(Exception::Type::notFound, "Document not found in database: " + docName);
    docId = stmt.get<int64_t>(0);

    // find chunk ids
    auto sql = "SELECT chunk_id FROM chunks WHERE doc_id = ?;";
    auto chunkStmt = sqlite.getStatement(sql);
    chunkStmt.bind(1, docId);
    std::vector<int64_t> chunkIds;
    while (chunkStmt.step())
    {
        chunkIds.push_back(chunkStmt.get<int64_t>(0)); // get chunk id
    }

    auto trans = sqlite.beginTransaction();
    
    // delete from documents table
    sql = "DELETE FROM documents WHERE id = ?;";
    auto docStmt = sqlite.getStatement(sql);
    docStmt.bind(1, docId);
    docStmt.step();
    if (docStmt.changes() == 0)
        throw Exception(Exception::Type::sqlError, "Failed to delete document from database: " + docName);
    
    // delete from text search table
    for(const auto &chunkId : chunkIds)
    {
        tTable.deleteChunk(chunkId); // delete chunk from text search table
    }

    // delete from vector table
    for(auto &vectorTable : vTable) // tranverse each vector table
    {
        vectorTable.removeVector(chunkIds); // delete batch of chunk from vector table
    }

    trans.commit(); // commit transaction
}

void DocPipe::addDoc()
{
    // check if the document is already in the database
    auto stmt = sqlite.getStatement("SELECT id FROM documents WHERE doc_name = ?;");
    stmt.bind(1, docName);
    if (stmt.step())
    {
        docId = stmt.get<int64_t>(0); // get docId
        throw Exception(Exception::Type::wrongArg, "Document already exists in database: " + docName);
    }

    // add doc to documnets table
    {
        auto trans = sqlite.beginTransaction();
        auto sql =
            "INSERT INTO documents (doc_name, last_modified, file_size, content_hash, last_checked) "
            "VALUES (?, ?, ?, ?, ?);";
        auto stmt = sqlite.getStatement(sql);
        stmt.bind(1, docName);
        stmt.bind(2, SqliteConnection::null);
        stmt.bind(3, SqliteConnection::null);
        stmt.bind(4, SqliteConnection::null);
        stmt.bind(5, SqliteConnection::null);
        stmt.step();
        if (stmt.changes() == 0)
            throw Exception(Exception::Type::sqlError, "Failed to add document to database: " + docName);

        docId = sqlite.getLastInsertId(); // get docId
        trans.commit();
    }

    // split, embed, and add to text table and vector table
    updateToTable();

    // update sqlite with new document info
    updateSqlite();

    return;
}

std::string DocPipe::calculateHash(const std::filesystem::path &path)
{
    // open file
    std::ifstream file{path, std::ios::binary};
    if(!file.is_open())
        throw Exception(Exception::Type::openError, "Failed to open file: " + path.string());

    std::vector<char> buffer(8192); // 8KB buffer
    XXH64_state_t *state = XXH64_createState(); // create a new state for hash calculation
    if(!state)
        throw Exception(Exception::Type::unknownError, "Failed to create hash state.");

    // calculate hash
    XXH64_reset(state, 0); // reset the state with initial hash value
    while(file.read(buffer.data(), buffer.size()))
    {
        XXH64_update(state, buffer.data(), file.gcount()); // update hash with the read data
    }
    XXH64_hash_t hash = XXH64_digest(state); // get the final hash value
    XXH64_freeState(state); // free the state
    file.close(); // close the file

    return std::to_string(hash); // convert hash to string and return
}

std::string DocPipe::calculateHash(const std::string &content)
{
    XXH64_state_t *state = XXH64_createState(); // create a new state for hash calculation
    if(!state)
        throw Exception(Exception::Type::unknownError, "Failed to create hash state.");

    // calculate hash
    XXH64_reset(state, 0); // reset the state with initial hash value
    XXH64_update(state, content.data(), content.size()); // update hash with the content
    XXH64_hash_t hash = XXH64_digest(state); // get the final hash value
    XXH64_freeState(state); // free the state

    return std::to_string(hash); // convert hash to string and return
}

void DocPipe::updateSqlite(std::string hash) const
{
    // get content_hash
    if(hash.empty())
    {
        hash = calculateHash(docPath); // calculate hash if not provided
    }
    // get last_modified
    auto lastModifiedTime = std::filesystem::last_write_time(docPath);
    auto lastModifiedTimeInt = std::chrono::duration_cast<std::chrono::seconds>(lastModifiedTime.time_since_epoch()).count();
    // get last_checked
    auto now = std::chrono::system_clock::now();
    auto last_checked = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
    // get file_size
    auto fileSize = static_cast<size_t>(std::filesystem::file_size(docPath));

    // write to documents table
    {
        auto trans = sqlite.beginTransaction();
        auto sql = 
            "INSERT OR REPLACE INTO documents (doc_name, last_modified, file_size, content_hash, last_checked) "
            "VALUES (?, ?, ?, ?, ?);";
        auto stmt = sqlite.getStatement(sql);
        stmt.bind(1, docName);
        stmt.bind(2, lastModifiedTimeInt);
        stmt.bind(3, fileSize);
        stmt.bind(4, hash);
        stmt.bind(5, last_checked);
        stmt.step();
        if(stmt.changes() == 0)
            throw Exception(Exception::Type::sqlError, "Failed to update document in database: " + docName);
        trans.commit(); // commit transaction
    }
    
    return;
}

void DocPipe::updateToTable()
{
    // 1. open file and read content to a string
    std::ifstream file{docPath};
    if(!file.is_open())
        throw Exception(Exception::Type::openError, "Failed to open file: " + docPath.string());
    std::stringstream buffer;
    buffer << file.rdbuf(); // read file content to string
    auto content = buffer.str(); // get string from stringstream
    if(content.empty())
        return;
    
    // 2. for each embedding model, update the embedding table and vector table
    if(embdModel.size() != vTable.size())
        throw Exception(Exception::Type::wrongArg, "Embedding model size and vector table size do not match: " + std::to_string(embdModel.size()) + " vs " + std::to_string(vTable.size()));
    for(int i = 0; i < embdModel.size(); i++)
    {
        auto &model = embdModel[i]; // get embedding model
        auto &vectortable = vTable[i]; // get vector table
        updateOneEmbedding(content, model, vectortable); // update embedding for this model
    }
}

// a slowly version, can be improved by adding batch process
void DocPipe::updateOneEmbedding(const std::string &content, EmbeddingModel &model, VectorTable &vectortable)
{
    // 1. split content to chunks
    std::vector<Chunker::Chunk> newChunks;
    {
        Chunker chunker(content, docType, model.getMaxInputLength()); // create chunker
        newChunks = chunker.getChunks();           // get chunks from chunker
    }

    // 2. get existing chunks
    // get existing chunks from sql chunks table
    struct chunkRow
    {
        int64_t chunkId;
        int64_t chunkIndex;
        std::string contentHash;
    };
    std::unordered_map<std::string, chunkRow> existingChunks; // construct hash map for existing chunks : hash -> chunkRow
    auto sql = "SELECT chunk_id, chunk_index, content_hash FROM chunks WHERE doc_id = ? AND embedding_id = ?;";
    auto stmt = sqlite.getStatement(sql);
    stmt.bind(1, docId);
    stmt.bind(2, model.getId());
    while (stmt.step())
    {
        chunkRow row;
        row.chunkId = stmt.get<int64_t>(0);
        row.chunkIndex = stmt.get<int64_t>(1);
        row.contentHash = stmt.get<std::string>(2);
        existingChunks[row.contentHash] = row;
    }

    // 3. compare new chunks with existing chunks, and update / add / delete chunks
    // traverse new chunks to add and update chunk in tables
    auto trans = sqlite.beginTransaction(); // begin transaction
    for (int index = 0; index < newChunks.size(); index++)
    {
        auto& chunk = newChunks[index]; // get new chunk
        auto hash = calculateHash(chunk.content + chunk.metadata); // calculate hash for new chunk
        auto it = existingChunks.find(hash);                 // find hash in existing chunks
        if (it != existingChunks.end())   // finded, update chunk
        {
            if(it->second.chunkIndex == index) // same index, no need to update
                continue; 
            
            // update chunks table
            auto chunkid = it->second.chunkId; // get chunk id
            auto sql = "UPDATE chunks SET chunk_index = ? WHERE chunk_id = ?;";
            auto stmt = sqlite.getStatement(sql); // prepare statement
            stmt.bind(1, index); // bind new index
            stmt.bind(2, chunkid); // bind chunk id
            stmt.step(); // execute statement
            if(stmt.changes() == 0) // check if updated
                throw Exception(Exception::Type::sqlError, "Failed to update chunk in database: " + std::to_string(chunkid));
            
            // no need to update vector table and text table, no changes
            
            existingChunks.erase(it); // remove from existing chunks
        }
        else // not found, add chunk
        {
            // add chunk to chunks table
            auto sql = "INSERT INTO chunks (doc_id, embedding_id, chunk_index, content_hash) VALUES (?, ?, ?, ?);";
            auto stmt = sqlite.getStatement(sql); // prepare statement
            stmt.bind(1, docId); // bind doc id
            stmt.bind(2, model.getId()); // bind embedding id
            stmt.bind(3, index); // bind chunk index
            stmt.bind(4, hash); // bind content hash
            stmt.step(); // execute statement
            if(stmt.changes() == 0) // check if added
                throw Exception(Exception::Type::sqlError, "Failed to add chunk to database: " + std::to_string(docId));
            
            auto chunkid = sqlite.getLastInsertId(); // get chunk id

            // add chunk to vector table
            auto embedding = model.embed(chunk.content); // get embedding from model
            vectortable.addVector(chunkid, embedding); // add vector to vector table

            // add chunk to text table
            tTable.addChunk({chunk.content, chunk.metadata, chunkid}); // add text to text table
        }
    }
    // delete remaining chunks in existing chunks
    for(auto& [_, row] : existingChunks)
    {
        // delete chunk from chunks table
        auto chunkid = row.chunkId; // get chunk id
        auto sql = "DELETE FROM chunks WHERE chunk_id = ?;"; // delete sql statement
        auto stmt = sqlite.getStatement(sql); // prepare statement
        stmt.bind(1, chunkid); // bind chunk id
        stmt.step(); // execute statement
        if(stmt.changes() == 0) // check if deleted
            throw Exception(Exception::Type::sqlError, "Failed to delete chunk from database: " + std::to_string(chunkid));
        
        // delete vector from vector table
        vectortable.removeVector(chunkid); // remove vector from vector table

        // delete text from text table
        tTable.deleteChunk(chunkid); // delete text from text table
    }
    trans.commit(); // commit transaction

    vectortable.reconstructFaissIndex();

    return;
}