#pragma once
#include <string>
#include <vector>
#include <shared_mutex>
#include <faiss/Index.h>
#include <filesystem>
#include <sqlite3.h>

#include "SqliteConnection.h"
#include "Utils.h"

extern Logger logger;

/*
This class manages a SQLite database and several vector tables.
Gurantee thread safety.
*/
class VectorTable// : public std::enable_shared_from_this<VectorTable> // to access self shared pointer in class methods
{
public:
    using idx_t = faiss::idx_t; // Faiss index type

private:
    // Faiss index type, can be changed for best performance
    // MUST use IDMAP2 for reconstruct supporting
    const std::string faissIndexType = "HNSW32,Flat,IDMap2";
    // Faiss metric type, can be changed for best performance
    const enum faiss::MetricType metricType = faiss::METRIC_L2;

    std::filesystem::path dbDirPath; // dir to store faiss db, will open or create the tablename.faiss file in this dir
    std::string tableName;
    int dimension = 0; // dimension of the vectors

    SqliteConnection& sqlite; // SQLite database connection

    faiss::Index* faissIndex = nullptr; // Faiss index pointer

    mutable std::shared_mutex mutex;

    const static int maxAddCoune = 1000;
    int addCount = 0; // number of vectors changed to the Faiss index, if more than maxAddCount, write to disk

    const static int maxDeleteCount = 1000;
    int deleteCount = 0; // number of vectors changed to the Faiss index, if more than maxDeleteCount, call reconstructFaissIndex

    // initialize SQLite table, should only be called when creating a new table
    void initializeSQLiteTable();

    // reconstruct Faiss index from SQLite database, may take a long time; can save memory and disk usage; return the number of vectors delete from sql table
    int reconstructFaissIndex(bool alreadyLocked);

    // write the Faiss index to disk, return the number of vectors written to disk successfully
    int writeToDisk(bool alreadyLocked);

public:
    // constructor will open faiss index from given path, if not exist, create a new one
    VectorTable(std::filesystem::path dbDirPath, const std::string &tableName, SqliteConnection &sqliteConnection, int dimension = -1);
    // the table will be written to the disk when the object is destroyed automatically
    ~VectorTable();

    // prevent copy and assignment
    VectorTable(const VectorTable &) = delete;
    VectorTable &operator=(const VectorTable &) = delete;
    VectorTable(VectorTable &&other) = delete;
    VectorTable &operator=(VectorTable &&)  = delete;

    // query the most similar vectors, return a pair with the top-x ids in vector and their distances in vector, x may smaller than maxResultCount
    std::pair<std::vector<faiss::idx_t>, std::vector<float>> search(const std::vector<float> &queryVector, int maxrRsultCount) const;

    // return the vector of given id
    // if the id is not in the table, return empty vector
    std::vector<float> getVectorFromId(faiss::idx_t id) const;
    
    // add a vector to the table, return it's id in VectorTable
    // if try to add same vector, it will overwrite the old one
    // low speed, do not use if unnecessary
    void addVector(idx_t id, const std::vector<float> &vector);
    // add batch of vectors to the table, return their ids in VectorTable
    // if try to add same vector, it will be add successfully, with defferent id, DO NOT DO THAT
    // highspeed, recommond to use
    void addVector(const std::vector<idx_t> &ids, const std::vector<std::vector<float>> &vectors);

    // remove a vector from the table, return it's id in VectorTable
    // if the id is not in the table, throw an exception
    idx_t removeVector(idx_t id); 
    // remove batch of vectors from table, return their ids in VectorTable
    // if the id is not in the table, throw an exception
    std::vector<idx_t> removeVector(const std::vector<idx_t> &ids);
    // remove batch of vectors from table, return their ids in VectorTable
    // if the id is not in the table, just ignore it
    std::vector<idx_t> removeVectorIfExists(const std::vector<idx_t> &ids);

    // write all changes to disk, this may delete vector from faiss index, make sure sqlite table has committed all changes before calling this function
    void write();

    // return ids which aren't in the faiss index, which means they will never appeare in the query result
    std::vector<idx_t> getInvalidIds() const;

    // drop table and delete faiss index file
    static void dropTable(SqliteConnection &sqlite, const std::filesystem::path& path, const std::string &tableName);
};