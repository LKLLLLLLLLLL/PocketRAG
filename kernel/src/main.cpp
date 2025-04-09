#include "VectorTable.h"
#include <iostream>
#include <chrono>
#include <vector>
#include <random>
#include <iomanip>
#include <cassert>
#include <algorithm>

// 生成随机向量数据
std::vector<std::vector<float>> generateRandomVectors(int count, int dimension)
{
    std::vector<std::vector<float>> vectors;
    vectors.reserve(count);

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> dis(-10.0, 10.0);

    for (int i = 0; i < count; ++i)
    {
        std::vector<float> vec;
        vec.reserve(dimension);
        for (int j = 0; j < dimension; ++j)
        {
            vec.push_back(static_cast<float>(dis(gen)));
        }
        vectors.push_back(vec);
    }

    return vectors;
}

int main()
{
    // 测试参数
    const std::string dbPath = "./test";
    const int dimension = 512;
    const int smallBatchSize = 1000;   // 小批量测试的向量数量
    const int largeBatchSize = 100000; // 大批量测试的向量数量
    const int queryCount = 100;        // 查询测试的数量
    const int deleteCount = 1000;      // 删除测试的数量
    const int topK = 10;               // 每次查询返回的结果数

    // --------------- 小批量测试：比较单次添加与批量添加性能 ---------------
    std::cout << "========== SMALL BATCH PERFORMANCE TEST ==========" << std::endl;

    // 生成小批量测试向量
    std::cout << "Generating " << smallBatchSize << " random vectors for small batch test..." << std::endl;
    auto smallTestVectors = generateRandomVectors(smallBatchSize, dimension);

    // 声明在外层作用域以便后续计算性能提升
    std::chrono::duration<double> elapsed1;

    // 1.1 测试单个添加方法
    {
        VectorTable &vt = VectorTable::getInstance();
        std::string tableName = "single_add_test";

        try
        {
            vt.createTable(dbPath, tableName, dimension);
            std::cout << "Table created for individual insertion test." << std::endl;
        }
        catch (const std::exception &e)
        {
            std::cerr << "Error creating table: " << e.what() << std::endl;
            return 1;
        }

        std::cout << "Testing individual insertion..." << std::endl;
        auto start1 = std::chrono::high_resolution_clock::now();

        std::vector<faiss::idx_t> individualIds;
        individualIds.reserve(smallBatchSize);

        for (int i = 0; i < smallBatchSize; ++i)
        {
            auto id = vt.addVector(smallTestVectors[i]);
            individualIds.push_back(id);
        }

        auto end1 = std::chrono::high_resolution_clock::now();
        elapsed1 = end1 - start1; // 保存到外层作用域的变量
        std::cout << "Added " << smallBatchSize << " vectors individually in "
                  << std::fixed << std::setprecision(3) << elapsed1.count()
                  << " seconds (" << (elapsed1.count() / smallBatchSize * 1000)
                  << " ms per vector)." << std::endl;

        vt.close();
    }

    // 1.2 测试批量添加方法
    {
        VectorTable &vt = VectorTable::getInstance();
        std::string tableName = "batch_add_test";

        try
        {
            vt.createTable(dbPath, tableName, dimension);
            std::cout << "Table created for batch insertion test." << std::endl;
        }
        catch (const std::exception &e)
        {
            std::cerr << "Error creating table: " << e.what() << std::endl;
            return 1;
        }

        std::cout << "Testing batch insertion..." << std::endl;
        auto start2 = std::chrono::high_resolution_clock::now();

        std::vector<faiss::idx_t> batchIds = vt.addVector(smallTestVectors);

        auto end2 = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double> elapsed2 = end2 - start2;
        std::cout << "Added " << smallBatchSize << " vectors in batch in "
                  << std::fixed << std::setprecision(3) << elapsed2.count()
                  << " seconds (" << (elapsed2.count() / smallBatchSize * 1000)
                  << " ms per vector)." << std::endl;

        // 计算性能提升
        double speedup = elapsed1.count() / elapsed2.count();
        double percentImprovement = (speedup - 1.0) * 100.0;
        double individualVectorsPerSecond = smallBatchSize / elapsed1.count();
        double batchVectorsPerSecond = smallBatchSize / elapsed2.count();

        std::cout << "\nPerformance Comparison:" << std::endl;
        std::cout << "------------------------------------------" << std::endl;
        std::cout << "Individual insertion: " << std::fixed << std::setprecision(3)
                  << elapsed1.count() << " seconds total" << std::endl;
        std::cout << "Batch insertion:     " << std::fixed << std::setprecision(3)
                  << elapsed2.count() << " seconds total" << std::endl;
        std::cout << "Speedup factor:      " << std::fixed << std::setprecision(2)
                  << speedup << "x" << std::endl;
        std::cout << "Improvement:         " << std::fixed << std::setprecision(1)
                  << percentImprovement << "%" << std::endl;
        std::cout << "Individual throughput: " << std::fixed << std::setprecision(1)
                  << individualVectorsPerSecond << " vectors/second" << std::endl;
        std::cout << "Batch throughput:     " << std::fixed << std::setprecision(1)
                  << batchVectorsPerSecond << " vectors/second" << std::endl;
        std::cout << "------------------------------------------" << std::endl;

        vt.close();
    }

    // --------------- 大批量测试 ---------------
    std::cout << "\n\n========== LARGE BATCH PERFORMANCE TEST ==========" << std::endl;
    
    // 创建表格
    VectorTable &vt = VectorTable::getInstance();
    std::string tableName = "large_batch_test";
    
    try {
        vt.createTable(dbPath, tableName, dimension);
        std::cout << "Table created for large batch test." << std::endl;
    } catch (const std::exception &e) {
        std::cerr << "Error creating table: " << e.what() << std::endl;
        return 1;
    }

    // 生成大批量随机测试向量
    std::cout << "Generating " << largeBatchSize << " random vectors..." << std::endl;
    auto testVectors = generateRandomVectors(largeBatchSize, dimension);

    // 2.1 测试大批量添加方法
    std::cout << "Testing large batch insertion..." << std::endl;
    auto startBatch = std::chrono::high_resolution_clock::now();

    std::vector<faiss::idx_t> batchIds = vt.addVector(testVectors);

    auto endBatch = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> elapsedBatch = endBatch - startBatch;
    std::cout << "Added " << largeBatchSize << " vectors in batch in "
              << std::fixed << std::setprecision(3) << elapsedBatch.count()
              << " seconds (" << (elapsedBatch.count() / largeBatchSize * 1000) << " ms per vector)." << std::endl;

    // 2.2 测试查询性能
    std::cout << "\nTesting query performance..." << std::endl;
    double totalQueryTime = 0.0;

    for (int i = 0; i < queryCount; ++i) {
        int idx = rand() % largeBatchSize;
        auto queryVector = testVectors[idx];

        auto startQuery = std::chrono::high_resolution_clock::now();
        auto results = vt.querySimlar(queryVector, topK);
        auto endQuery = std::chrono::high_resolution_clock::now();

        std::chrono::duration<double> queryTime = endQuery - startQuery;
        totalQueryTime += queryTime.count();

        // 验证查询结果不为空
        if (results.first.empty() || results.second.empty()) {
            std::cerr << "Error: No results found for query " << i << std::endl;
        }
    }

    double avgQueryTime = totalQueryTime / queryCount;
    std::cout << "Performed " << queryCount << " queries in "
              << std::fixed << std::setprecision(3) << totalQueryTime
              << " seconds (" << (avgQueryTime * 1000) << " ms per query)." << std::endl;

    // 2.3 测试删除性能
    std::cout << "\nTesting vector deletion..." << std::endl;

    // 随机选择一些ID进行删除
    std::vector<faiss::idx_t> idsToDelete;
    for (int i = 0; i < deleteCount; ++i) {
        int idx = rand() % batchIds.size();
        idsToDelete.push_back(batchIds[idx]);
    }

    auto startDelete = std::chrono::high_resolution_clock::now();

    int successfulDeletes = 0;
    for (auto id : idsToDelete) {
        try {
            vt.removeVector(id);
            successfulDeletes++;
        } catch (const std::exception &e) {
            std::cerr << "Error deleting vector with ID " << id << ": " << e.what() << std::endl;
        }
    }

    auto endDelete = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> deleteTime = endDelete - startDelete;

    std::cout << "Deleted " << successfulDeletes << " out of " << deleteCount << " vectors in "
              << std::fixed << std::setprecision(3) << deleteTime.count()
              << " seconds (" << (deleteTime.count() / successfulDeletes * 1000) << " ms per deletion)." << std::endl;

    // 2.4 验证删除的正确性
    std::cout << "\nVerifying deletion correctness..." << std::endl;
    bool deletionCorrect = true;
    int deletionChecks = std::min(20, successfulDeletes); // 检查前20个删除的ID

    for (int i = 0; i < deletionChecks; ++i) {
        auto id = idsToDelete[i];

        try {
            // 尝试获取已删除的向量，应该会抛出异常
            auto vector = vt.getVectorFromId(id);
            std::cerr << "Error: Vector with ID " << id << " still exists after deletion." << std::endl;
            deletionCorrect = false;
        } catch (...) {
            // 预期会抛出异常，这是正确的
        }

        // 查询相似向量，确保已删除的ID不在结果中
        auto queryVector = testVectors[rand() % largeBatchSize];
        auto queryResults = vt.querySimlar(queryVector, largeBatchSize / 100); // 查询较多结果

        if (std::find(queryResults.first.begin(), queryResults.first.end(), id) != queryResults.first.end()) {
            std::cerr << "Error: Deleted vector ID " << id << " still appears in query results." << std::endl;
            deletionCorrect = false;
        }
    }

    if (deletionCorrect) {
        std::cout << "All deletion verification tests passed." << std::endl;
    } else {
        std::cout << "Some deletion verification tests failed." << std::endl;
    }

    // 关闭表格
    vt.close();
    std::cout << "\nTests completed." << std::endl;

    std::cout << "Press Enter to exit..." << std::endl;
    std::cin.get();

    return 0;
}