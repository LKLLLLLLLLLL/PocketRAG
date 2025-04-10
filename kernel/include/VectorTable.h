#include <string>
#include <vector>
#include <sqlite3.h>
#include <memory>
#include <faiss/Index.h>
#include <iostream>

/*
This class manages a SQLite database and several vector tables.
can only be initialized once.
is only a single thread class, may run slowly.
Only support one Faiss subTable now. 
Todo: support multiple Faiss subTable.
*/
class VectorTable
{
private:

    VectorTable() = default;

    // Faiss index type, can be changed for best performance
    // MUST use IDMAP2 for reconstruct supporting
    const std::string faissIndexType = "HNSW32,Flat,IDMap2";
    // Faiss metric type, can be changed for best performance
    const enum faiss::MetricType metricType = faiss::METRIC_L2;

    struct SQLiteDeleter // to delete sqlite3 pointer safely
    {
        void operator()(sqlite3 *db) const
        {
            sqlite3_close_v2(db);
        }
    };

    std::string dbPath; // path to store databases
    std::string tableName;
    int dimension = 0; // dimension of the vectors

    std::shared_ptr<sqlite3>sqliteDB = std::shared_ptr<sqlite3>(nullptr, SQLiteDeleter()); // SQLite database pointer
    // be caregul, everytime when use sqliteDB.reset(), need to give SQLiteDeleter(), because reset() method whill change the deleter
    faiss::Index* faissIndex = nullptr; // Faiss index pointer

    const int maxAddCoune = 1000;
    int addCount = 0; // number of vectors changed to the Faiss index, if more than maxAddCount, write to disk

    const int maxDeleteCount = 1000;
    int deleteCount = 0; // number of vectors changed to the Faiss index, if more than maxDeleteCount, call reconstructFaissIndex

    // initialize SQLite table, should only be called when creating a new table
    void initializeSQLiteTable();

    // check if the SQLite database and Faiss index are initialized
    inline void checkInitialized() const
    {
        if (sqliteDB.get() == nullptr)
            throw std::runtime_error("SQLite database is not initialized.");
        if (faissIndex == nullptr)
            throw std::runtime_error("Faiss index is not initialized.");
    }

public:
    using idx_t = faiss::idx_t; // Faiss index type

    // prevent copy and assignment
    VectorTable(const VectorTable &) = delete;
    VectorTable &operator=(const VectorTable &) = delete;

    // get a object of VectorTable, prevent multiple instances
    static VectorTable &getInstance()
    {
        static VectorTable instance;
        return instance;
    }

    // open SQLite database and Faiss index from given path
    void open(const std::string& dbPath, const std::string& tableName);

    // close SQLite database and Faiss index, prepare for next open
    void close();

    // create a new table in given path
    void createTable(const std::string& dbPath, const std::string& tableName, int dimension);

    // the table will be written to the disk when the object is destroyed automatically
    ~VectorTable();

    // query the most similar vectors, return a pair with the top-x ids in vector and their distances in vector, x may smaller than maxResultCount
    std::pair<std::vector<faiss::idx_t>, std::vector<float>> querySimlar(const std::vector<float> &queryVector, int maxrRsultCount) const;

    // return the vector of given id
    // if the id is not in the table, throw std::runtime_error("Vector is invalid or deleted."), you can catch it for checking
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
    idx_t removeVector(idx_t id); 
    // remove batch of vectors from table, return their ids in VectorTable
    std::vector<idx_t> removeVector(const std::vector<idx_t> &ids);

    // write the Faiss index to disk, return the number of vectors written to disk successfully
    int writeToDisk();

    // reconstruct Faiss index from SQLite database, may take a long time; can save memory and disk usage; return the number of vectors delete from sql table
    int reconstructFaissIndex();

    // return ids which aren't in the faiss index, which means they will never appeare in the query result
    std::vector<idx_t> getInvalidIds() const;
};