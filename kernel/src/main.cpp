#include "VectorTable.h"
#include <iostream>
#include <cassert>
#include <cstdio>
#include <chrono> // 用于统计运行时间
#include <vector>

// Helper function to delete a file (cross-platform)
void deleteFile(const char *filename)
{
    if (std::remove(filename) != 0)
    {
        perror("Error deleting file");
    }
}

int main()
{
    // Test database path and table name
    const std::string dbPath = "./test";
    const std::string tableName = "test_table";
    const int dimension = 512;
    const int numVectors = 100000; // 测试向量数量

    // 1. Create a VectorTable
    VectorTable &vt = VectorTable::getInstance();

    // 2. Create a new table
    vt.createTable(dbPath, tableName, dimension);
    std::cout << "Table created successfully." << std::endl;

    // 3. Add a large number of vectors and measure time
    std::cout << "Adding " << numVectors << " vectors..." << std::endl;
    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < numVectors; ++i)
    {
        std::vector<float> testVector(dimension, static_cast<float>(i % 100)); // 模拟数据
        vt.addVector(testVector);
        if (i % 10000 == 0)
        {
            std::cout << "Added " << i << " vectors..." << std::endl;
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> elapsed = end - start;
    std::cout << "Added " << numVectors << " vectors in " << elapsed.count() << " seconds." << std::endl;

    // 4. Close the table
    vt.close();
    std::cout << "Table closed successfully." << std::endl;

    // 5. Re-open the table and verify it still works
    vt.open(dbPath, tableName);
    std::cout << "Table re-opened successfully." << std::endl;

    // 6. Query a vector and measure time
    std::vector<float> queryVector(dimension, 50.0f); // 模拟查询向量
    int maxResults = 10;
    std::cout << "Querying similar vectors..." << std::endl;
    start = std::chrono::high_resolution_clock::now();

    auto results = vt.querySimlar(queryVector, maxResults);

    end = std::chrono::high_resolution_clock::now();
    elapsed = end - start;
    std::cout << "Query completed in " << elapsed.count() << " seconds." << std::endl;

    // Print query results
    std::cout << "Top " << maxResults << " similar vectors:" << std::endl;
    for (size_t i = 0; i < results.first.size(); ++i)
    {
        std::cout << "ID: " << results.first[i] << ", Distance: " << results.second[i] << std::endl;
    }

    // 7. Close the table
    vt.close();
    std::cout << "Table closed successfully." << std::endl;

    // 8. Clean up: Delete the database file
    // deleteFile(dbPath.c_str());

    std::cout << "All tests completed." << std::endl;

    return 0;
}