#include "VectorTable.h"

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

std::set<std::filesystem::path> VectorTable::pathSet;
std::mutex VectorTable::faissMutex;

VectorTable::VectorTable(const std::string &dbPath, const std::string &tableName, SqliteConnection &sqlite, int dim) : tableName(tableName), sqlite(sqlite)
{
    dbFullPath = std::filesystem::path(dbPath) / (tableName + ".faiss");

    // check if the database path is already opened
    {
        std::lock_guard<std::mutex> lock(faissMutex); // lock the mutex to protect pathSet
        if (pathSet.find(dbFullPath) != pathSet.end())
            throw Exception{Exception::Type::openError, "Database path already opened: " + dbFullPath.string()};
        pathSet.insert(dbFullPath); // add the database path to the set
    }

    // check if the directory exists, if not, create it
    if (!std::filesystem::exists(dbPath))
        std::filesystem::create_directories(dbPath);

    // initialize SQLite table
    initializeSQLiteTable();

    // try to open or creat a faiss index
    if(std::filesystem::exists(dbFullPath))
    {
        faissIndex = faiss::read_index(dbFullPath.string().c_str());
        if (faissIndex == nullptr)
            throw Exception{Exception::Type::openError, "Failed to open Faiss index: " + dbFullPath.string()};
        dimension = faissIndex->d;
    }
    else if(dim > 0)
    {
        // create Faiss index in memory
        faissIndex = faiss::index_factory(dim, faissIndexType.c_str(), metricType);
        if (faissIndex == nullptr)
            throw Exception{Exception::Type::openError, "Failed to create Faiss index in memory."};
        dimension = dim;
        // write Faiss index to disk
        faiss::write_index(faissIndex, dbFullPath.string().c_str());
    }
    else
    {
        throw Exception{Exception::Type::openError, "Faiss index not found and dimension is not set."};
    }

    // change non writeback vector to invalid vector in SQLite table
    auto updateSQL = "UPDATE " + tableName + 
        " SET valid = 0, writeback = 0"
        " WHERE valid = 1 AND writeback = 0;";
    try
    {
        sqlite.execute(updateSQL);
    }
    catch (const std::exception &e)
    {
        throw Exception{Exception::Type::fatalError, "[FATAL]Failed to update non-writen vector to SQLite table, may cause conflict: " + std::string(e.what())};
    }
}

void VectorTable::initializeSQLiteTable()
{
    auto createSQL = 
        "CREATE TABLE IF NOT EXISTS " + tableName + " ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " //主键，自动递增 
        "valid BOOLEAN NOT NULL DEFAULT 0, " //布尔值，默认值为 false(0), 说明向量是否已写入内存中的Faiss数据库 
        "writeback BOOLEAN NOT NULL DEFAULT 0, " //布尔值，默认值为 false(0), 说明向量是否已写入磁盘中的Faiss数据库
        "deleted BOOLEAN NOT NULL DEFAULT 0" //尔值，默认值为 false(0), 说明向量是否已删除
    ");";
    sqlite.execute(createSQL);
}

VectorTable::~VectorTable()
{
    if (faissIndex != nullptr)
    {
        reconstructFaissIndex();
        writeToDisk();
    }
    {
        std::lock_guard<std::mutex> lock(faissMutex); 
        pathSet.erase(dbFullPath); // remove the database path from the set
    }
}

// a slowly version
std::pair<std::vector<faiss::idx_t>, std::vector<float>> VectorTable::querySimlar(const std::vector<float> &queryVector, int maxResultCount) const
{
    if(queryVector.size() != dimension)
        throw Exception{Exception::Type::wrongArg, "Query vector dimension does not match the VectorTable dimension."};
    if(!faissIndex->is_trained)
        throw Exception{Exception::Type::unknownError, "Faiss index is not trained."};
    if(maxResultCount <= 0)
        throw Exception{Exception::Type::wrongArg, "Result count must be greater than 0."};
    
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
    const std::string querySQL = "SELECT id, valid, deleted FROM " + tableName + " WHERE id IN (" + idList + ");";
    auto queryStmt = sqlite.getStatement(querySQL); // prepare the statement
    std::unordered_map<faiss::idx_t, std::pair<bool, bool>> idToFlagMap; //pair.first is valid, pair.second is deleted
    while(queryStmt.step())
    {
        auto id = queryStmt.get<faiss::idx_t>(0);
        auto valid = queryStmt.get<int>(1);
        auto deleted = queryStmt.get<int>(2);
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

    return {validResultIndex, validResultDistance};
}

std::vector<float> VectorTable::getVectorFromId(faiss::idx_t id) const
{
    if(id < 0)
        throw Exception{Exception::Type::wrongArg, "Id is out of range."};

    // check if the vector's valid flag and deleted flag in SQLite table
    auto querySQL = "SELECT valid, deleted FROM " + tableName + " WHERE id = ?;";
    auto queryStmt = sqlite.getStatement(querySQL);
    queryStmt.bind(1, id);
    if (!queryStmt.step()) // check if the vector exists in SQLite table
        return {}; // return empty vector
    auto valid = queryStmt.get<int>(0);
    auto deleted = queryStmt.get<int>(1);
    if (valid == 0 || deleted != 0) // check if the vector is valid and not deleted
        return {};                  // return empty vector

    // get vector from index
    auto vector = std::vector<float>(dimension);
    faissIndex->reconstruct(id, vector.data());

    return vector;
}

int VectorTable::writeToDisk()
{
    if(addCount == 0)
        return 0; // no need to write to disk

    // avoid overwriting the old index file while writing the new one
    std::filesystem::path newFile = dbFullPath.parent_path() / (tableName + ".faiss.new");
    faiss::write_index(faissIndex, newFile.string().c_str());
    // remove old index file and rename the new one
    std::filesystem::remove(dbFullPath);
    std::filesystem::rename(newFile, dbFullPath);

    // change falg in SQLite table
    auto updateSQL = "UPDATE " + tableName + 
        " SET writeback = 1"
        " WHERE valid = 1 AND writeback = 0;";
    int changedCount = sqlite.execute(updateSQL);

    addCount = 0; // reset add count
    return changedCount;
}

VectorTable::idx_t VectorTable::addVector(const std::vector<float> &vector)
{
    if(vector.size() != dimension)
        throw Exception{Exception::Type::wrongArg, "Vector dimension does not match the VectorTable dimension."};

    // 1. add vector to SQLite table, but set flag invalid
    auto insertSQL = "INSERT INTO " + tableName + " (valid) VALUES (0);";
    sqlite.execute(insertSQL);
    auto id = sqlite.getLastInsertId(); // get the last insert id

    // 2. add vector to Faiss index
    faissIndex->add_with_ids(1, vector.data(), &id);

    // 3. add successfully, change flag in SQLite table
    auto updateSQL = "UPDATE " + tableName + " SET valid = 1 WHERE id = ?;";
    auto updateStmt = sqlite.getStatement(updateSQL); 
    updateStmt.bind(1, id);
    updateStmt.step(); 

    // check if need to write to disk
    addCount++;
    if (addCount >= maxAddCoune) 
        writeToDisk();

    return id;
}

std::vector<VectorTable::idx_t> VectorTable::addVector(const std::vector<std::vector<float>> &vectors)
{
    if(vectors.empty())
        throw Exception{Exception::Type::wrongArg, "Vectors are empty."};
    if (vectors[0].size() != dimension)
        throw Exception{Exception::Type::wrongArg, "Vector dimension does not match the VectorTable dimension."};
    auto resultIds = std::vector<idx_t>(vectors.size());

    // 1. add vectors to SQLite table, but set flag invalid
    auto trans1 = sqlite.beginTransaction(); // begin transaction_1
    try
    {
        auto insertSQL = "INSERT INTO " + tableName + " (valid) VALUES (0);";
        auto insertStmt = sqlite.getStatement(insertSQL); // prepare the statement
        // insert vectors into SQLite table
        for (size_t i = 0; i < vectors.size(); i++)
        {
            insertStmt.step(); 
            resultIds[i] = sqlite.getLastInsertId(); 
            insertStmt.reset(); // reset the statement for the next bind
        }
    } catch (...) {
        trans1.rollback(); // rollback transaction_1
        throw;
    }
    trans1.commit(); // commit transaction_1

    // convert std::vector<std::vector<float>> &vectors to std::vector<float> &vectors, may slow down
    auto flatVectors = std::vector<float>(vectors.size() * dimension);
    for (size_t i = 0; i < vectors.size(); i++)
    {
        // std::copy(vectors[i].begin(), vectors[i].end(), flatVectors.begin() + i * dimension);
        if (vectors[i].size() != dimension)
        {
            throw Exception{Exception::Type::wrongArg, "Vector at index " + std::to_string(i) + " has incorrect dimension " + std::to_string(vectors[i].size()) + " (expected " + std::to_string(dimension) + ")"};
        }
        std::memcpy(flatVectors.data() + i * dimension, vectors[i].data(), dimension * sizeof(float)); // faster than std::copy
    }

    // 2. add vectors to Faiss index
    faissIndex->add_with_ids(vectors.size(), flatVectors.data(), resultIds.data());

    // 3. add successfully, change flag in SQLite table
    auto trans2 = sqlite.beginTransaction(); // begin transaction_2
    try
    {
        auto updateSQL = "UPDATE " + tableName + " SET valid = 1 WHERE id = ?;";
        auto updateStmt = sqlite.getStatement(updateSQL); // prepare the statement
        // update valid flag in SQLite table
        for (size_t i = 0; i < resultIds.size(); i++)
        {
            updateStmt.bind(1, resultIds[i]);
            updateStmt.step(); 
            updateStmt.reset(); // reset the statement for the next bind
        }
    } catch (...) {
        trans2.rollback(); // rollback transaction_2
        throw;
    }
    trans2.commit(); // commit transaction_2

    // check if need to write to disk
    addCount += vectors.size();
    if (addCount >= maxAddCoune)
        writeToDisk();

    return resultIds;
}

// this function will only mark the vector as invalid in SQLite table, cannot remove it from Faiss index
VectorTable::idx_t VectorTable::removeVector(idx_t id)
{
    if (id < 0)
        throw Exception{Exception::Type::wrongArg, "Id is out of range."};
    
    // sign the vector by valid = false in SQLite table
    auto updateSQL = "UPDATE " + tableName + " SET deleted = 1 WHERE id = ?;";
    auto updateStmt = sqlite.getStatement(updateSQL);
    updateStmt.bind(1, id);
    updateStmt.step();
    int changes = updateStmt.changes(); 

    // check if the vector exists in SQLite table
    if (changes == 0)
        throw Exception{Exception::Type::wrongArg, "Vector with ID " + std::to_string(id) + " does not exist."};

    // check if need to reconstruct Faiss index
    deleteCount++;
    if (deleteCount >= maxDeleteCount)
        reconstructFaissIndex();

    return id;
}

// this function will only mark the vector as invalid in SQLite table, cannot remove it from Faiss index
std::vector<VectorTable::idx_t> VectorTable::removeVector(const std::vector<VectorTable::idx_t> &ids)
{
    if (ids.empty())
        return {}; // no ids to remove

    // sign the vector by valid = false in SQLite table
    auto trans = sqlite.beginTransaction(); // begin transaction
    try
    {
        auto updateSQL = "UPDATE " + tableName + " SET deleted = 1 WHERE id = ?;";
        auto updateStmt = sqlite.getStatement(updateSQL); 
        // update deleted flag in SQLite table
        for (const auto &id : ids)
        {
            updateStmt.bind(1, id);
            updateStmt.step();
            int changes = updateStmt.changes();
            if (changes == 0)
                throw Exception{Exception::Type::wrongArg, "Vector with ID " + std::to_string(id) + " does not exist."};
            updateStmt.reset(); // reset the statement for the next bind
        }
    }
    catch (...)
    {
        trans.rollback(); // rollback transaction
        throw;
    }
    trans.commit(); // commit transaction

    // check if need to reconstruct Faiss index
    deleteCount += ids.size();
    if (deleteCount >= maxDeleteCount)
        reconstructFaissIndex();

    return ids;
}

// all valid = false or delete = true vectors will be removed from Faiss index, but only delete = true vectors will be removed from SQLite table 
int VectorTable::reconstructFaissIndex()
{
    if(deleteCount == 0)
        return 0; // no need to reconstruct Faiss index
    
    // get all valid idx from SQL table
    auto querySQL = "SELECT id FROM " + tableName + " WHERE valid = 1 AND deleted = 0;";
    auto queryStmt = sqlite.getStatement(querySQL);
    std::vector<faiss::idx_t> validIdList;
    while(queryStmt.step())
    {
        auto id = queryStmt.get<faiss::idx_t>(0);
        validIdList.push_back(id);
    }

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
    auto deleteSQL = "DELETE FROM " + tableName + " WHERE deleted = 1;";
    int deletedNum = sqlite.execute(deleteSQL); 

    // save new Faiss index
    faissIndex = newFaissIndex;
    writeToDisk();

    deleteCount = 0; // reset delete count

    return deletedNum;
}

std::vector<VectorTable::idx_t> VectorTable::getInvalidIds() const
{
    // get all invalid ids from SQL table
    auto querySQL = "SELECT id FROM " + tableName + " WHERE valid = 0 AND deleted = 0;";
    auto queryStmt = sqlite.getStatement(querySQL);

    std::vector<idx_t> invalidIdList;
    while(queryStmt.step())
    {
        auto id = queryStmt.get<idx_t>(0);
        invalidIdList.push_back(id); // store invalid ids in invalidIdList
    }
    
    return invalidIdList;
}
