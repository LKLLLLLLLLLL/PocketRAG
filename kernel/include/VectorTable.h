#pragma once
#include <string>
#include <vector>
#include <sqlite3.h>
#include <memory>
#include <faiss/Index.h>
#include <iostream>
#include <filesystem>

#include "SqliteConnection.h"

/*
This class manages a SQLite database and several vector tables.
can only be initialized once.
is only a single thread class, may run slowly.
Only support one Faiss subTable now. 
Todo: support multiple Faiss subTable.
*/
class VectorTable
{
public:
    using idx_t = faiss::idx_t; // Faiss index type

    struct Exception : public std::exception
    {
        enum class Type {openError, fatalError, wrongArg, unknownError};
        Type type;
        std::string message;

        Exception(Type type, const std::string &message) : type(type), message(message) {}
        const char* what() const noexcept override { return message.c_str(); } // override what() method
    };

private:
    // Faiss index type, can be changed for best performance
    // MUST use IDMAP2 for reconstruct supporting
    const std::string faissIndexType = "HNSW32,Flat,IDMap2";
    // Faiss metric type, can be changed for best performance
    const enum faiss::MetricType metricType = faiss::METRIC_L2;

    std::filesystem::path dbFullPath; // path to store faiss db, ending with "/tableName.faiss"
    std::string tableName;
    int dimension = 0; // dimension of the vectors

    SqliteConnection& sqlite; // SQLite database connection

    faiss::Index* faissIndex = nullptr; // Faiss index pointer

    static std::set<std::filesystem::path> pathSet; // set to make sure each VectorTable have no more than 1 user
    static std::mutex faissMutex;

    const static int maxAddCoune = 1000;
    int addCount = 0; // number of vectors changed to the Faiss index, if more than maxAddCount, write to disk

    const static int maxDeleteCount = 1000;
    int deleteCount = 0; // number of vectors changed to the Faiss index, if more than maxDeleteCount, call reconstructFaissIndex

    // initialize SQLite table, should only be called when creating a new table
    void initializeSQLiteTable();

public:
    // constructor will open faiss index from given path, if not exist, create a new one
    VectorTable(const std::string &dbPath, const std::string &tableName, SqliteConnection &sqliteConnection, int dimension = -1);
    // the table will be written to the disk when the object is destroyed automatically
    ~VectorTable();

    // prevent copy and assignment
    VectorTable(const VectorTable &) = delete;
    VectorTable &operator=(const VectorTable &) = delete;

    // query the most similar vectors, return a pair with the top-x ids in vector and their distances in vector, x may smaller than maxResultCount
    std::pair<std::vector<faiss::idx_t>, std::vector<float>> querySimlar(const std::vector<float> &queryVector, int maxrRsultCount) const;

    // return the vector of given id
    // if the id is not in the table, return empty vector
    std::vector<float> getVectorFromId(faiss::idx_t id) const;
    
    // add a vector to the table, return it's id in VectorTable
    // if try to add same vector, it will be add successfully, with defferent id, DO NOT DO THAT
    // low speed, do not use if unnecessary
    idx_t addVector(const std::vector<float> &vector);
    // add batch of vectors to the table, return their ids in VectorTable
    // if try to add same vector, it will be add successfully, with defferent id, DO NOT DO THAT
    // highspeed, recommond to use
    std::vector<idx_t> addVector(const std::vector<std::vector<float>> &vectors);

    // remove a vector from the table, return it's id in VectorTable
    // if the id is not in the table, throw an exception
    idx_t removeVector(idx_t id); 
    // remove batch of vectors from table, return their ids in VectorTable
    // if the id is not in the table, throw an exception
    std::vector<idx_t> removeVector(const std::vector<idx_t> &ids);

    // write the Faiss index to disk, return the number of vectors written to disk successfully
    int writeToDisk();

    // reconstruct Faiss index from SQLite database, may take a long time; can save memory and disk usage; return the number of vectors delete from sql table
    int reconstructFaissIndex();

    // return ids which aren't in the faiss index, which means they will never appeare in the query result
    std::vector<idx_t> getInvalidIds() const;
};