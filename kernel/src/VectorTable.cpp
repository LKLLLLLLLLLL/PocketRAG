#include <VectorTable.h>
#include <string>
#include <vector>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <memory>
#include <unordered_map>

#include <sqlite3.h>
#include <faiss/Index.h>
#include <faiss/index_io.h>
#include <faiss/index_factory.h>

void VectorTable::createTable(const std::string &dbPath_, const std::string &tableName_, int dimension_)
{
    if(sqliteDB != nullptr)
        throw std::runtime_error("SQLite database is already opened, cannot create before close it.");
    if(faissIndex != nullptr)
        throw std::runtime_error("Faiss index is already openedm, cannot create before close it.");
    if(std::filesystem::exists(dbPath_ + "/" + tableName_ + ".db")
        || std::filesystem::exists(dbPath_ + "/" + tableName_ + ".faiss"))
        throw std::runtime_error("Database already exists: " + dbPath_ + "/" + tableName_ + ".db");

    dbPath = dbPath_;
    tableName = tableName_;
    dimension = dimension_;

    // check if the directory exists, if not, create it
    if (!std::filesystem::exists(dbPath))
        std::filesystem::create_directories(dbPath);
    
    // try to create SQLite database
    std::string dbFullPath = dbPath + "/" + tableName;
    sqlite3 *dbHandle = nullptr;
    auto returnCode = sqlite3_open_v2((dbFullPath + ".db").c_str(), &dbHandle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI, nullptr);
    sqliteDB.reset(dbHandle, SQLiteDeleter());
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to create SQLite database: " + dbFullPath + ".db" + "\n    sqlite error " + sqlite3_errmsg(sqliteDB.get()));


    // initialize SQLite table
    initializeSQLiteTable();

    // create Faiss index in memory
    faissIndex = faiss::index_factory(dimension, faissIndexType.c_str(), metricType);
    if(faissIndex == nullptr) 
        throw std::runtime_error("Failed to create Faiss index in memory.");

    // write Faiss index to disk
    faiss::write_index(faissIndex, (dbFullPath + ".faiss").c_str());
}

void VectorTable::initializeSQLiteTable()
{
    if (sqliteDB == nullptr)
        throw std::runtime_error("SQLite database is not created.");

    const char *createTableSQL = R"(
        CREATE TABLE 
        Vector(
            id INTEGER PRIMARY KEY AUTOINCREMENT, --主键，自动递增 
            valid BOOLEAN NOT NULL DEFAULT 0, --布尔值，默认值为 false(0), 说明向量是否已写入内存中的Faiss数据库 
            writeback BOOLEAN NOT NULL DEFAULT 0, --布尔值，默认值为 false(0), 说明向量是否已写入磁盘中的Faiss数据库
            deleted BOOLEAN NOT NULL DEFAULT 0 --布尔值，默认值为 false(0), 说明向量是否已删除
        );
    )";

    auto returnCode = sqlite3_exec(sqliteDB.get(), createTableSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to create SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
}

void VectorTable::open(const std::string &dbPath_, const std::string &tableName_)
{
    if (sqliteDB != nullptr)
        throw std::runtime_error("SQLite database is already opened, cannot create before close it.");
    if (faissIndex != nullptr)
        throw std::runtime_error("Faiss index is already openedm, cannot create before close it.");

    dbPath = dbPath_;
    tableName = tableName_;

    // check if the directory exists, if not, create it
    if (!std::filesystem::exists(dbPath))
        throw std::runtime_error("Database path does not exist: " + dbPath);

    // try open SQLite database
    std::string dbFullPath = dbPath + "/" + tableName;
    sqlite3 *dbHandle = nullptr;
    auto returnCode = sqlite3_open_v2((dbFullPath + ".db").c_str(), &dbHandle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_URI, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to open SQLite database: " + dbFullPath + ".db" + "\n    sqlite error " + sqlite3_errmsg(sqliteDB.get()));
    sqliteDB.reset(dbHandle, SQLiteDeleter());
    
    // try open Faiss index
    faissIndex=faiss::read_index((dbFullPath + ".faiss").c_str());
    if (faissIndex == nullptr)
        throw std::runtime_error("Failed to open Faiss index: " + dbFullPath + ".faiss");
    dimension = faissIndex->d;

    // change non writeback vector to invalid vector in SQLite table
    const char *updateSQL = R"(
        UPDATE Vector
        SET valid = 0, writeback = 0
        WHERE valid = 1 AND writeback = 0;
    )";
    auto returnCode = sqlite3_exec(sqliteDB.get(), updateSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to update SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
}

void VectorTable::close()
{
    if(sqliteDB.get() == nullptr)
        throw std::runtime_error("SQLite database is not opened.");
    if(faissIndex == nullptr)
        throw std::runtime_error("Faiss index is not opened.");
    
    reconstructFaissIndex();
    writeToDisk(); // write Faiss index to disk

    sqliteDB.reset(); // close SQLite database
    faissIndex = nullptr; // close Faiss index
}

VectorTable::~VectorTable()
{
    if (faissIndex != nullptr)
    {
        reconstructFaissIndex();
        writeToDisk();
    }
}

// a slowly version
std::pair<std::vector<faiss::idx_t>, std::vector<float>> VectorTable::querySimlar(const std::vector<float> &queryVector, int maxResultCount) const
{
    checkInitialized();
    if(queryVector.size() != dimension)
        throw std::runtime_error("Query vector dimension does not match the VectorTable dimension.");
    if(!faissIndex->is_trained)
        throw std::runtime_error("Faiss index is not trained.");
    if(maxResultCount <= 0)
        throw std::runtime_error("Result count must be greater than 0.");
    
    //search from index
    auto resultIndex = std::vector<faiss::idx_t>(maxResultCount);
    auto resultDistance = std::vector<float>(maxResultCount);
    faissIndex->search(1, queryVector.data(), maxResultCount, resultDistance.data(), resultIndex.data());

    // check if the result's valid flag and deleted flag in SQLite table
    // prepare vectors to store valid results
    std::vector<faiss::idx_t> validResultIndex;
    std::vector<float> validResultDistance;
    validResultIndex.reserve(maxResultCount);
    validResultDistance.reserve(maxResultCount);

    // query ids in resultIndex
    std::string idList;
    for (auto& i : resultIndex)
    {
        if (i != resultIndex[0]) // avoid duplicate ids
            idList += ",";
        idList += std::to_string(i);
    }
    const std::string querySQL = "SELECT id, valid, deleted FROM Vector WHERE id IN (" + idList + ");";
    sqlite3_stmt *stmt = nullptr;
    auto returnCode = sqlite3_prepare_v2(sqliteDB.get(), querySQL.c_str(), -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    std::unordered_map<faiss::idx_t, std::pair<bool, bool>> idToFlagMap; //pair.first is valid, pair.second is deleted
    try{
        while (sqlite3_step(stmt) == SQLITE_ROW)  // store flag in idtToFlagMap
        {
            auto id = sqlite3_column_int64(stmt, 0);
            auto valid = sqlite3_column_int(stmt, 1);
            auto deleted = sqlite3_column_int(stmt, 2);
            idToFlagMap[id] = {valid != 0, deleted != 0};
        }
        for(int i = 0; i < resultIndex.size(); i++) // filter unexpected results
        {
            auto id = resultIndex[i];
            auto flagPair = idToFlagMap[id];
            if(flagPair.first && !flagPair.second) // only keep ids with valid = true and deleted = false 
            {
                validResultIndex.push_back(id);
                validResultDistance.push_back(resultDistance[i]);
            }
        }
    } catch (...) {
        if(stmt) sqlite3_finalize(stmt);
        throw;
    }
    return {resultIndex, resultDistance};
}

std::vector<float> VectorTable::getVectorFromId(faiss::idx_t id) const
{
    checkInitialized();
    if(id < 0)
        throw std::runtime_error("Id is out of range.");

    // get vector from index
    auto vector = std::vector<float>(dimension);
    faissIndex->reconstruct(id, vector.data());

    // check if the vector's valid flag and deleted flag in SQLite table
    const char *querySQL = "SELECT valid, deleted FROM Vector WHERE id = ?;";
    sqlite3_stmt *stmt = nullptr;
    auto returnCode = sqlite3_prepare_v2(sqliteDB.get(), querySQL, -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    try{
        sqlite3_bind_int64(stmt, 1, id);
        returnCode = sqlite3_step(stmt);
        if (returnCode != SQLITE_ROW)
            throw std::runtime_error("Failed to query SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
        auto valid = sqlite3_column_int(stmt, 0);
        auto deleted = sqlite3_column_int(stmt, 1);
        if(valid == 0 || deleted != 0) // check if the vector is valid and not deleted
            throw std::runtime_error("Vector is invalid or deleted.");
    } catch (...) {
        if(stmt) sqlite3_finalize(stmt);
        throw;
    }
    if(stmt) sqlite3_finalize(stmt);

    return vector;
}

int VectorTable::writeToDisk()
{
    if(faissIndex == nullptr)
        throw std::runtime_error("FaissIndex is not initialized.");
    if(addCount == 0)
        return 0; // no need to write to disk

    // avoid overwriting the old index file while writing the new one
    std::string backupFile = dbPath + "/" + tableName + ".faiss.new";
    faiss::write_index(faissIndex, backupFile.c_str());
    // remove old index file and rename the new one
    std::filesystem::remove(dbPath + "/" + tableName + ".faiss");
    std::filesystem::rename(backupFile, dbPath + "/" + tableName + ".faiss");

    // change falg in SQLite table
    const char *updateSQL = R"(
        UPDATE Vector
        SET writeback = 1
        WHERE valid = 1 AND writeback = 0;
    )";
    auto returnCode = sqlite3_exec(sqliteDB.get(), updateSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to update SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    int changedCount = sqlite3_changes(sqliteDB.get());

    addCount = 0; // reset add count
    return changedCount;
}

VectorTable::idx_t VectorTable::addVector(const std::vector<float> &vector)
{
    checkInitialized();
    if(vector.size() != dimension)
        throw std::runtime_error("Vector dimension does not match the VectorTable dimension.");

    // add vector to SQLite table, but set flag invalid
    const char *insertSQL = "INSERT INTO Vector (valid) VALUES (0);";
    auto returnCode = sqlite3_exec(sqliteDB.get(), insertSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to insert into SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    auto id = static_cast<idx_t>(sqlite3_last_insert_rowid(sqliteDB.get()));

    // add vector to Faiss index
    faissIndex->add_with_ids(1, vector.data(), &id);

    // add successfully, change flag in SQLite table
    const char *updateSQL = "UPDATE Vector SET valid = 1 WHERE id = ?;";
    sqlite3_stmt *stmt = nullptr;
    returnCode = sqlite3_prepare_v2(sqliteDB.get(), updateSQL, -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    try{ // prevent stmt leaked
        sqlite3_bind_int64(stmt, 1, id);
        returnCode = sqlite3_step(stmt);
        if (returnCode != SQLITE_DONE)
            throw std::runtime_error("Failed to update SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    } catch (...) {
        if(stmt) sqlite3_finalize(stmt);
        throw;
    }
    if(stmt) sqlite3_finalize(stmt);

    // check if need to write to disk
    addCount++;
    if (addCount >= maxAddCoune) 
        writeToDisk();

    return id;
}

std::vector<VectorTable::idx_t> VectorTable::addVector(const std::vector<std::vector<float>> &vectors)
{
    checkInitialized();
    if(vectors.empty())
        throw std::runtime_error("Vectors are empty.");
    if (vectors[0].size() != dimension)
        throw std::runtime_error("Vector dimension does not match the VectorTable dimension.");

    auto resultIds = std::vector<idx_t>(vectors.size());

    // add vectors to SQLite table, but set flag invalid
    // begin transaction_1
    const char *beginSQL = "BEGIN TRANSACTION;";
    auto returnCode = sqlite3_exec(sqliteDB.get(), beginSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to begin SQLite transaction: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    sqlite3_stmt *stmt = nullptr;
    try{
        const char *insertSQL = "INSERT INTO Vector (valid) VALUES (0);";
        returnCode = sqlite3_prepare_v2(sqliteDB.get(), insertSQL, -1, &stmt, nullptr); // precompile the statement for high speed
        if (returnCode != SQLITE_OK)
            throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
        // insert vectors into SQLite table
        for (size_t i = 0; i < vectors.size(); i++)
        {
            returnCode = sqlite3_step(stmt);
            if (returnCode != SQLITE_DONE)
                throw std::runtime_error("Failed to insert into SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
            resultIds[i] = static_cast<idx_t>(sqlite3_last_insert_rowid(sqliteDB.get()));
            sqlite3_reset(stmt); // reset the statement for the next bind
        }
    }
    catch (...)
    {
        // rollback transaction_1
        const char *rollbackSQL = "ROLLBACK;";
        sqlite3_exec(sqliteDB.get(), rollbackSQL, nullptr, nullptr, nullptr);
        if(stmt) sqlite3_finalize(stmt);
        throw;
    }
    if(stmt) sqlite3_finalize(stmt);
    // commit transaction_1
    const char *commitSQL = "COMMIT;";
    returnCode = sqlite3_exec(sqliteDB.get(), commitSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to commit SQLite transaction: " + std::string(sqlite3_errmsg(sqliteDB.get())));

    // convert std::vector<std::vector<float>> &vectors to std::vector<float> &vectors, may slow down
    auto flatVectors = std::vector<float>(vectors.size() * dimension);
    for (size_t i = 0; i < vectors.size(); i++)
    {
        // std::copy(vectors[i].begin(), vectors[i].end(), flatVectors.begin() + i * dimension);
        if (vectors[i].size() != dimension)
        {
            throw std::runtime_error("Vector at index " + std::to_string(i) + " has incorrect dimension " + std::to_string(vectors[i].size()) + " (expected " + std::to_string(dimension) + ")");
        }
        std::memcpy(flatVectors.data() + i * dimension, vectors[i].data(), dimension * sizeof(float)); // faster than std::copy
    }

    // add vectors to Faiss index
    faissIndex->add_with_ids(vectors.size(), flatVectors.data(), resultIds.data());

    // add successfully, change flag in SQLite table
    // begin transaction_2
    beginSQL = "BEGIN TRANSACTION;";
    returnCode = sqlite3_exec(sqliteDB.get(), beginSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to begin SQLite transaction: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    stmt = nullptr;
    try
    {

        const char *updateSQL = "UPDATE Vector SET valid = 1 WHERE id = ?;";
        returnCode = sqlite3_prepare_v2(sqliteDB.get(), updateSQL, -1, &stmt, nullptr); // precompile the statement for high speed
        if (returnCode != SQLITE_OK)
            throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
        // update valid flag in SQLite table
        for (size_t i = 0; i < resultIds.size(); i++)
        {
            sqlite3_bind_int64(stmt, 1, resultIds[i]);
            returnCode = sqlite3_step(stmt);
            if (returnCode != SQLITE_DONE)
                throw std::runtime_error("Failed to update SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
            sqlite3_reset(stmt); // reset the statement for the next bind
        }
    }
    catch (...)
    {
        // rollback transaction_2
        const char *rollbackSQL = "ROLLBACK;";
        sqlite3_exec(sqliteDB.get(), rollbackSQL, nullptr, nullptr, nullptr);
        if (stmt)
            sqlite3_finalize(stmt);
        throw;
    }
    if (stmt)
        sqlite3_finalize(stmt);
    // commit transaction_2
    commitSQL = "COMMIT;";
    returnCode = sqlite3_exec(sqliteDB.get(), commitSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to commit SQLite transaction: " + std::string(sqlite3_errmsg(sqliteDB.get())));

    // 增加计数器并检查是否需要写入磁盘
    addCount += vectors.size();
    if (addCount >= maxAddCoune)
        writeToDisk();

    return resultIds;
}

// this function will only mark the vector as invalid in SQLite table, cannot remove it from Faiss index
VectorTable::idx_t VectorTable::removeVector(idx_t id)
{
    checkInitialized();
    if (id < 0)
        throw std::runtime_error("Id is out of range.");
    
    // sign the vector by valid = false in SQLite table
    const char *updateSQL = "UPDATE Vector SET deleted = 1 WHERE id = ?;";
    sqlite3_stmt *stmt = nullptr;
    auto returnCode = sqlite3_prepare_v2(sqliteDB.get(), updateSQL, -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    try{ // prevent stmt leaked
        sqlite3_bind_int64(stmt, 1, id);
        returnCode = sqlite3_step(stmt);
        if (returnCode != SQLITE_DONE)
            throw std::runtime_error("Failed to update SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    } catch (...) {
        if(stmt) sqlite3_finalize(stmt);
        throw;
    }

    // check if the vector exists in SQLite table
    int changes = sqlite3_changes(sqliteDB.get());
    if (changes == 0)
        throw std::runtime_error("Vector with ID " + std::to_string(id) + " does not exist.");

    // check if need to reconstruct Faiss index
    deleteCount++;
    if (deleteCount >= maxDeleteCount)
        reconstructFaissIndex();

    return id;
}

// this function will only mark the vector as invalid in SQLite table, cannot remove it from Faiss index
std::vector<VectorTable::idx_t> VectorTable::removeVector(const std::vector<VectorTable::idx_t> &ids)
{
    checkInitialized();
    if (ids.empty())
        throw std::runtime_error("Ids are empty.");

    // sign the vector by valid = false in SQLite table
    // begin transaction_1
    const char *beginSQL = "BEGIN TRANSACTION;";
    auto returnCode = sqlite3_exec(sqliteDB.get(), beginSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to begin SQLite transaction: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    sqlite3_stmt *stmt_query = nullptr;
    sqlite3_stmt *stmt_update = nullptr;
    try{
        // initialize query statement
        const char *checkSQL = "SELECT id FROM Vector WHERE id = ? AND deleted = 0;";
        returnCode = sqlite3_prepare_v2(sqliteDB.get(), checkSQL, -1, &stmt_query, nullptr);
        if (returnCode != SQLITE_OK)
            throw std::runtime_error("Failed to prepare SQLite check statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
        const char *updateSQL = "UPDATE Vector SET deleted = 1 WHERE id = ?;";
        // initialize update statement
        auto returnCode = sqlite3_prepare_v2(sqliteDB.get(), updateSQL, -1, &stmt_update, nullptr);
        if (returnCode != SQLITE_OK)
            throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
        for (const auto &id : ids)
        {
            // query if id exists
            sqlite3_bind_int64(stmt_query, 1, id);
            returnCode = sqlite3_step(stmt_query);
            if (returnCode != SQLITE_ROW)
            {
                throw std::runtime_error("Vector with ID " + std::to_string(id) + " does not exist, the remove operation do not happen.");
            }
            sqlite3_reset(stmt_query); 
            // update deleted flag
            sqlite3_bind_int64(stmt_update, 1, id);
            returnCode = sqlite3_step(stmt_update);
            if (returnCode != SQLITE_DONE)
                throw std::runtime_error("Failed to update SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
            sqlite3_reset(stmt_update); // reset the statement for the next bind
        }
    }
    catch (...)
    {
        if (stmt_query) sqlite3_finalize(stmt_query);
        if (stmt_update) sqlite3_finalize(stmt_update);
        // rollback transaction_1
        const char *rollbackSQL = "ROLLBACK;";
        sqlite3_exec(sqliteDB.get(), rollbackSQL, nullptr, nullptr, nullptr);
        throw;
    }
    if (stmt_query) sqlite3_finalize(stmt_query);
    if (stmt_update) sqlite3_finalize(stmt_update);
    // commit transaction_1
    const char *commitSQL = "COMMIT;";
    returnCode = sqlite3_exec(sqliteDB.get(), commitSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to commit SQLite transaction: " + std::string(sqlite3_errmsg(sqliteDB.get())));

    // check if need to reconstruct Faiss index
    deleteCount += ids.size();
    if (deleteCount >= maxDeleteCount)
        reconstructFaissIndex();

    return ids;
}

// all valid = false or delete = true vectors will be removed from Faiss index, but only delete = true vectors will be removed from SQLite table 
int VectorTable::reconstructFaissIndex()
{
    checkInitialized();
    if(deleteCount == 0)
        return 0; // no need to reconstruct Faiss index
    
    // get all valid idx from SQL table
    const char *querySQL = "SELECT id FROM Vector WHERE valid = 1 AND deleted = 0;";
    sqlite3_stmt *stmt = nullptr;
    auto returnCode = sqlite3_prepare_v2(sqliteDB.get(), querySQL, -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    std::vector<faiss::idx_t> validIdList;
    try{
        while (sqlite3_step(stmt) == SQLITE_ROW)  // store valid ids in validIdList
        {
            auto id = sqlite3_column_int64(stmt, 0);
            validIdList.push_back(id);
        }
    } catch (...) {
        if(stmt) sqlite3_finalize(stmt);
        throw;
    }
    if(stmt) sqlite3_finalize(stmt);

    // create new Faiss index in memory
    faiss::Index *newFaissIndex = faiss::index_factory(dimension, faissIndexType.c_str(), metricType);
    if (newFaissIndex == nullptr)
        throw std::runtime_error("Failed to create new Faiss index in memory.");
    if(!validIdList.empty())
    {
        // get valid vectors by valid ids from faiss index
        auto validVectors = std::vector<float>(validIdList.size() * dimension);
        faissIndex->reconstruct_batch(validIdList.size(), validIdList.data(), validVectors.data());
        // add all valid vectors to new Faiss index
        newFaissIndex->add_with_ids(validIdList.size(), validVectors.data(), validIdList.data());
    }

    // update SQL table, remove the droped vectors
    const char *deleteSQL = R"(
        DELETE FROM Vector
        WHERE deleted = 1;
    )";
    returnCode = sqlite3_exec(sqliteDB.get(), deleteSQL, nullptr, nullptr, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to delete from SQLite table: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    int deletedNum = sqlite3_changes(sqliteDB.get());

    // save new Faiss index
    faissIndex = newFaissIndex;
    writeToDisk();

    deleteCount = 0; // reset delete count

    return deletedNum;
}

std::vector<VectorTable::idx_t> VectorTable::getInvalidIds() const
{
    checkInitialized();

    // get all invalid ids from SQL table
    const char *querySQL = "SELECT id FROM Vector WHERE valid = 0 AND deleted = 0;";
    sqlite3_stmt *stmt = nullptr;
    auto returnCode = sqlite3_prepare_v2(sqliteDB.get(), querySQL, -1, &stmt, nullptr);
    if (returnCode != SQLITE_OK)
        throw std::runtime_error("Failed to prepare SQLite statement: " + std::string(sqlite3_errmsg(sqliteDB.get())));
    
    std::vector<idx_t> invalidIdList;
    try{
        while (sqlite3_step(stmt) == SQLITE_ROW)  // store invalid ids in invalidIdList
        {
            auto id = sqlite3_column_int64(stmt, 0);
            invalidIdList.push_back(id);
        }
    } catch (...) {
        if(stmt) sqlite3_finalize(stmt);
        throw;
    }
    
    return invalidIdList;
}
