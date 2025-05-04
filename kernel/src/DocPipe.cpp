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

//-------------------------------------DocPipe-------------------------------------//
DocPipe::DocPipe(std::filesystem::path docPath, SqliteConnection &sqlite, TextSearchTable &tTable, std::vector<VectorTable> &vTable, std::vector<EmbeddingModel> &embdModel) : docPath(docPath), sqlite(sqlite), vTable(vTable), tTable(tTable), embdModel(embdModel)
{
    // extract docName from docPath
    docName = docPath.filename().string();

    // get doc type
    auto fileType = docPath.extension().string(); // get document's type
    if (fileType == ".txt")
        docType = Chunker::docType::plainText;
    else if (fileType == ".md")
        docType = Chunker::docType::Markdown;
    else
        throw Exception(Exception::Type::wrongArg, "Unsupported document type: " + fileType);
}

void DocPipe::check()
{
    // check if the doeument exists
    if(!std::filesystem::exists(docPath))
    {
        state = DocState::deleted;
        return;
    }

    // check if the document is a file
    if(!std::filesystem::is_regular_file(docPath))
        throw Exception(Exception::Type::notFound, "Document is not a file: " + docPath.string());

    // check if the document exists in the database
    auto stmt = sqlite.getStatement("SELECT id, last_modified, last_checked, content_hash FROM documents WHERE doc_name = ?");
    stmt.bind(1, docName);
    if (!stmt.step())
    {
        state = DocState::created;
        return;
    }

    // document exists both on disk and in database
    // check if the document is modified
    // get docId, last_modified time, last_checked time, content_hash from documents table
    stmt = sqlite.getStatement("SELECT id, last_modified, last_checked, content_hash FROM documents WHERE doc_name = ?");
    stmt.bind(1, docName);
    if (!stmt.step())
        throw Exception(Exception::Type::notFound, "Document not found in database: " + docName);

    docId = stmt.get<int64_t>(0);
    auto lastModified = stmt.get<int64_t>(1);
    auto lastChecked = stmt.get<int64_t>(2);
    auto contentHash = stmt.get<std::string>(3);

    // quick check if the document is changed
    auto lastModifiedTime = std::filesystem::last_write_time(docPath);
    auto lastModifiedTimeInt = std::chrono::duration_cast<std::chrono::seconds>(lastModifiedTime.time_since_epoch()).count();
    if (lastModifiedTimeInt != lastModified)
    {
        state = DocState::modified; // document is modified
        return;
    }

    auto now = std::chrono::system_clock::now();
    auto nowInt = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
    if (nowInt - lastChecked <= maxUncheckedTime)
    {
        return; // no need to check again
    }

    // deep check if the document is changed
    auto hash = calculatedocHash(docPath);
    if (hash != contentHash)
    {
        state = DocState::modified; // document is modified
        return;
    }

    return; // no need to update
}

void DocPipe::process(std::function<void(double)> callback)
{
    switch(state)
    {
        case DocState::modified:
            updateDoc(callback);
            break;
        case DocState::created:
            addDoc(callback);
            break;
        case DocState::deleted:
            delDoc(callback);
            break;
        default:
            break; // do nothing
    }
}

void DocPipe::updateDoc(std::function<void(double)> callback)
{
    // create progress object
    std::vector<std::pair<std::string, double>> subProgress;
    subProgress.push_back({"openfile", 0.02});
    for(auto &model : embdModel)
    {
        subProgress.push_back({"embedding", 0.97 / embdModel.size()});
    }
    subProgress.push_back({"updatesql", 0.01});
    Progress progress(callback, subProgress); // create progress object

    updateToTable(progress);
    updateSqlite();
    progress.finishSubprogress(); // finish update sqlite progress

    return; 
}

void DocPipe::delDoc(std::function<void(double)> callback)
{
    // create progress object
    Progress progress(callback);

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
    progress.update(0.2); // update progress

    auto trans = sqlite.beginTransaction();

    // delete from chunks table
    sql = "DELETE FROM chunks WHERE doc_id = ?;"; // delete all chunks for this document
    auto chunkDelStmt = sqlite.getStatement(sql);
    chunkDelStmt.bind(1, docId);
    chunkDelStmt.step();
    progress.update(0.4); // update progress
    
    // delete from documents table
    sql = "DELETE FROM documents WHERE id = ?;";
    auto docStmt = sqlite.getStatement(sql);
    docStmt.bind(1, docId);
    docStmt.step();
    if (docStmt.changes() == 0)
        throw Exception(Exception::Type::sqlError, "Failed to delete document from database: " + docName);
    progress.update(0.6); // update progress
    
    // delete from text search table
    for(const auto &chunkId : chunkIds)
    {
        tTable.deleteChunk(chunkId); // delete chunk from text search table
    }
    progress.update(0.8); // update progress

    // delete from vector table
    for(auto &vectorTable : vTable) // tranverse each vector table
    {
        vectorTable.removeVector(chunkIds); // delete batch of chunk from vector table
    }

    trans.commit(); // commit transaction
    progress.update(1.0); // update progress
}

void DocPipe::addDoc(std::function<void(double)> callback)
{
    // create progress object
    std::vector<std::pair<std::string, double>> subProgress;
    subProgress.push_back({"insert_documents_table", 0.01});
    subProgress.push_back({"openfile", 0.02});
    for(auto &model : embdModel)
    {
        subProgress.push_back({"embedding", 0.96 / embdModel.size()});
    }
    subProgress.push_back({"updatesql", 0.01});
    Progress progress(callback, subProgress); // create progress object
    
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
    progress.finishSubprogress(); // finish insert documents table progress

    // split, embed, and add to text table and vector table
    updateToTable(progress);

    // update sqlite with new document info
    updateSqlite();
    progress.finishSubprogress(); // finish update sqlite progress

    return;
}

std::string DocPipe::calculatedocHash(const std::filesystem::path &path)
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
    file.read(buffer.data(), buffer.size());
    while(file.gcount() > 0)
    {
        XXH64_update(state, buffer.data(), file.gcount()); // update hash with the read data
        file.read(buffer.data(), buffer.size());
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
        hash = calculatedocHash(docPath); // calculate hash if not provided
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
            "UPDATE documents SET doc_name = ?, last_modified = ?, file_size = ?, content_hash = ?, last_checked = ? "
            "WHERE id = ?;"; // use REPLACE to update or insert
        auto stmt = sqlite.getStatement(sql);
        stmt.bind(1, docName);
        stmt.bind(2, lastModifiedTimeInt);
        stmt.bind(3, fileSize);
        stmt.bind(4, hash);
        stmt.bind(5, last_checked);
        stmt.bind(6, docId); // bind docId
        stmt.step();
        if(stmt.changes() == 0)
            throw Exception(Exception::Type::sqlError, "Failed to update document in database: " + docName);
        trans.commit(); // commit transaction
    }
    
    return;
}

void DocPipe::updateToTable(Progress& progress)
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
    progress.finishSubprogress(); // finish open file progress
    
    // 2. for each embedding model, update the embedding table and vector table
    if(embdModel.size() != vTable.size())
        throw Exception(Exception::Type::wrongArg, "Embedding model size and vector table size do not match: " + std::to_string(embdModel.size()) + " vs " + std::to_string(vTable.size()));
    for(int i = 0; i < embdModel.size(); i++)
    {
        auto &model = embdModel[i]; // get embedding model
        auto &vectortable = vTable[i]; // get vector table
        updateOneEmbedding(content, model, vectortable, progress); // update embedding for this model
        progress.finishSubprogress(); // finish embedding progress
    }
}

// a slowly version, can be improved by adding batch process
void DocPipe::updateOneEmbedding(const std::string &content, EmbeddingModel &model, VectorTable &vectortable, Progress& progress)
{
    // 1. split content to chunks
    std::vector<Chunker::Chunk> newChunks;
    {
        Chunker chunker(content, docType, model.getMaxInputLength()); // create chunker
        newChunks = chunker.getChunks();           // get chunks from chunker
    }
    progress.updateSubprocess(0.01); 

    // 2. get existing chunks
    // get existing chunks from sql chunks table
    struct chunkRow
    {
        int64_t chunkId;
        int64_t chunkIndex;
        std::string contentHash;
    };
    std::unordered_multimap<std::string, chunkRow> existingChunks; // construct hash map for existing chunks : hash -> chunkRow
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
        existingChunks.insert({row.contentHash, row}); // insert chunk row to hash map
    }
    progress.updateSubprocess(0.02); 

    // 3. compare new chunks with existing chunks, and update / add / delete chunks
    // traverse new chunks to add and update chunk in tables
    auto trans = sqlite.beginTransaction(); // begin transaction
    std::queue<size_t> addChunkQueue; 
    std::queue<std::pair<size_t, int>> updateChunkQueue; // store index and chunk id for update
    for (int index = 0; index < newChunks.size(); index++)
    {
        auto& chunk = newChunks[index]; // get new chunk
        auto hash = calculateHash(chunk.content + chunk.metadata); // calculate hash for new chunk
        auto it = existingChunks.find(hash);                 // find hash in existing chunks
        if (it != existingChunks.end())   // finded, update chunk
        {
            if (it->second.chunkIndex != index) // deffrend index, update chunk index
            {
                updateChunkQueue.push({index, it->second.chunkId}); // add chunk to update queue
                // set their index to NULL, avoid conflict with other chunks
                auto sql = "UPDATE chunks SET chunk_index = NULL WHERE chunk_id = ?;"; // update sql statement
                auto stmt = sqlite.getStatement(sql); // prepare statement
                stmt.bind(1, it->second.chunkId); // bind chunk id
                stmt.step(); // execute statement
                if (stmt.changes() == 0) // check if updated
                    throw Exception(Exception::Type::sqlError, "Failed to update chunk in database: " + std::to_string(it->second.chunkId));
            }
            existingChunks.erase(it); // remove from existing chunks
        }
        else // not found, add chunk
        {
            addChunkQueue.push(index); // add chunk to queue for later processing
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
    progress.updateSubprocess(0.03);
    // update chunks
    while (!updateChunkQueue.empty())
    {
        auto [index, chunkid] = updateChunkQueue.front(); // get chunk index
        updateChunkQueue.pop();
        auto &chunk = newChunks[index]; // get chunk from new chunks

        // update chunks table
        auto sql = "UPDATE chunks SET chunk_index = ? WHERE chunk_id = ?;";
        auto stmt = sqlite.getStatement(sql); // prepare statement
        stmt.bind(1, index);                  // bind new index
        stmt.bind(2, chunkid);                // bind chunk id
        stmt.step();                          // execute statement
        if (stmt.changes() == 0)              // check if updated
            throw Exception(Exception::Type::sqlError, "Failed to update chunk in database: " + std::to_string(chunkid));

        // no need to update vector table and text table, no changes
    }
    progress.updateSubprocess(0.04); // update progress
    // add chunks
    double addCount = addChunkQueue.size();
    while(!addChunkQueue.empty())
    {
        auto index = addChunkQueue.front(); // get chunk index
        addChunkQueue.pop(); // remove from queue
        auto& chunk = newChunks[index]; // get chunk from new chunks
        auto hash = calculateHash(chunk.content + chunk.metadata); // calculate hash for new chunk

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

        progress.updateSubprocess(0.04 + (addCount - addChunkQueue.size()) * 0.95 / addCount); // update progress
    }

    trans.commit(); // commit transaction

    return;
}


//---------------------------------Progress---------------------------------//
DocPipe::Progress::Progress(std::function<void(double)> callback, std::vector<std::pair<std::string, double>> subProgress) : callback(callback)
{
    double total_length = 0.0;
    for (auto &subprogress : subProgress)
    {
        if (subprogress.second <= 0.0)
            throw Exception(Exception::Type::wrongArg, "Step length must be greater than 0.0: " + subprogress.first);
        total_length += subprogress.second;
    }
    double ratio = 1.0 / total_length;
    steps.push_back({"start", 0.0});
    for (auto &subprogress : subProgress)
    {
        double last_progress = steps.back().second;
        steps.push_back({subprogress.first + "_finished", last_progress + subprogress.second * ratio});
    }
    if (steps.back().second != 1.0) // fix float point error
        steps.back().second = 1.0;
}

void DocPipe::Progress::update(double progress)
{
    if (progress < 0.0 || progress > 1.0)
        throw Exception(Exception::Type::wrongArg, "Progress must be in range [0.0, 1.0]: " + std::to_string(progress));
    if (!steps.empty())
        throw Exception(Exception::Type::wrongArg, "Steps are not empty, please use updateStep() instead of update()");
    this->progress = progress;
    callback(this->progress); // call the callback function with the current progress
}

void DocPipe::Progress::updateSubprocess(double progress)
{
    if (progress < 0.0 || progress > 1.0)
        throw Exception(Exception::Type::wrongArg, "Progress must be in range [0.0, 1.0]: " + std::to_string(progress));
    if (steps.empty())
        throw Exception(Exception::Type::wrongArg, "Steps are empty, please use update() instead of updateStep()");
    this->progress = steps[currentStep].second + progress * (steps[currentStep + 1].second - steps[currentStep].second);
    callback(this->progress); // call the callback function with the current progress
}

void DocPipe::Progress::finishSubprogress()
{
    if (steps.empty())
        throw Exception(Exception::Type::wrongArg, "Steps are empty, please use update() instead of finishSubprogress()");
    if (currentStep >= steps.size() - 1)
        throw Exception(Exception::Type::wrongArg, "No more steps to finish: " + std::to_string(currentStep));
    currentStep++;
    this->progress = steps[currentStep].second; // set progress to the next step
    callback(this->progress);                   // call the callback function with the current progress
}
