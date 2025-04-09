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

// 测试函数1: 小批量测试，比较单次添加与批量添加性能
bool testSmallBatchPerformance(const std::string &dbPath, int dimension, int batchSize = 1000)
{
    std::cout << "========== SMALL BATCH PERFORMANCE TEST ==========" << std::endl;

    // 生成小批量测试向量
    std::cout << "Generating " << batchSize << " random vectors for small batch test..." << std::endl;
    auto testVectors = generateRandomVectors(batchSize, dimension);

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
            return false;
        }

        std::cout << "Testing individual insertion..." << std::endl;
        auto start1 = std::chrono::high_resolution_clock::now();

        std::vector<faiss::idx_t> individualIds;
        individualIds.reserve(batchSize);

        for (int i = 0; i < batchSize; ++i)
        {
            auto id = vt.addVector(testVectors[i]);
            individualIds.push_back(id);
        }

        auto end1 = std::chrono::high_resolution_clock::now();
        elapsed1 = end1 - start1;
        std::cout << "Added " << batchSize << " vectors individually in "
                  << std::fixed << std::setprecision(3) << elapsed1.count()
                  << " seconds (" << (elapsed1.count() / batchSize * 1000)
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
            return false;
        }

        std::cout << "Testing batch insertion..." << std::endl;
        auto start2 = std::chrono::high_resolution_clock::now();

        std::vector<faiss::idx_t> batchIds = vt.addVector(testVectors);

        auto end2 = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double> elapsed2 = end2 - start2;
        std::cout << "Added " << batchSize << " vectors in batch in "
                  << std::fixed << std::setprecision(3) << elapsed2.count()
                  << " seconds (" << (elapsed2.count() / batchSize * 1000)
                  << " ms per vector)." << std::endl;

        // 计算性能提升
        double speedup = elapsed1.count() / elapsed2.count();
        double percentImprovement = (speedup - 1.0) * 100.0;
        double individualVectorsPerSecond = batchSize / elapsed1.count();
        double batchVectorsPerSecond = batchSize / elapsed2.count();

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

    return true;
}

// 测试函数2: 大批量测试，包括批量添加、查询和删除操作
bool testLargeBatchOperations(const std::string &dbPath, int dimension,
                              int batchSize = 100000, int queryCount = 100,
                              int deleteCount = 1000, int topK = 10)
{
    std::cout << "\n========== LARGE BATCH OPERATIONS TEST ==========" << std::endl;

    // 创建表格
    VectorTable &vt = VectorTable::getInstance();
    std::string tableName = "large_batch_test";

    try
    {
        vt.createTable(dbPath, tableName, dimension);
        std::cout << "Table created for large batch test." << std::endl;
    }
    catch (const std::exception &e)
    {
        std::cerr << "Error creating table: " << e.what() << std::endl;
        return false;
    }

    // 生成大批量随机测试向量
    std::cout << "Generating " << batchSize << " random vectors..." << std::endl;
    auto testVectors = generateRandomVectors(batchSize, dimension);

    // 1. 测试大批量添加方法
    std::cout << "Testing large batch insertion..." << std::endl;
    auto startBatch = std::chrono::high_resolution_clock::now();

    std::vector<faiss::idx_t> batchIds = vt.addVector(testVectors);

    auto endBatch = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> elapsedBatch = endBatch - startBatch;
    std::cout << "Added " << batchSize << " vectors in batch in "
              << std::fixed << std::setprecision(3) << elapsedBatch.count()
              << " seconds (" << (elapsedBatch.count() / batchSize * 1000)
              << " ms per vector)." << std::endl;

    // 2. 测试查询性能
    std::cout << "\nTesting query performance..." << std::endl;
    double totalQueryTime = 0.0;

    for (int i = 0; i < queryCount; ++i)
    {
        int idx = rand() % batchSize;
        auto queryVector = testVectors[idx];

        auto startQuery = std::chrono::high_resolution_clock::now();
        auto results = vt.querySimlar(queryVector, topK);
        auto endQuery = std::chrono::high_resolution_clock::now();

        std::chrono::duration<double> queryTime = endQuery - startQuery;
        totalQueryTime += queryTime.count();

        // 验证查询结果不为空
        if (results.first.empty() || results.second.empty())
        {
            std::cerr << "Error: No results found for query " << i << std::endl;
        }
    }

    double avgQueryTime = totalQueryTime / queryCount;
    std::cout << "Performed " << queryCount << " queries in "
              << std::fixed << std::setprecision(3) << totalQueryTime
              << " seconds (" << (avgQueryTime * 1000) << " ms per query)." << std::endl;

    // 3. 测试删除性能
    std::cout << "\nTesting vector deletion..." << std::endl;

    // 随机选择一些ID进行删除
    std::vector<faiss::idx_t> idsToDelete;
    for (int i = 0; i < deleteCount; ++i)
    {
        int idx = rand() % batchIds.size();
        idsToDelete.push_back(batchIds[idx]);
    }

    auto startDelete = std::chrono::high_resolution_clock::now();

    int successfulDeletes = 0;
    for (auto id : idsToDelete)
    {
        try
        {
            vt.removeVector(id);
            successfulDeletes++;
        }
        catch (const std::exception &e)
        {
            std::cerr << "Error deleting vector with ID " << id << ": " << e.what() << std::endl;
        }
    }

    auto endDelete = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> deleteTime = endDelete - startDelete;

    std::cout << "Deleted " << successfulDeletes << " out of " << deleteCount << " vectors in "
              << std::fixed << std::setprecision(3) << deleteTime.count()
              << " seconds (" << (deleteTime.count() / successfulDeletes * 1000)
              << " ms per deletion)." << std::endl;

    // 4. 验证删除的正确性
    std::cout << "\nVerifying deletion correctness..." << std::endl;
    bool deletionCorrect = true;
    int deletionChecks = std::min(20, successfulDeletes); // 检查前20个删除的ID

    for (int i = 0; i < deletionChecks; ++i)
    {
        auto id = idsToDelete[i];

        try
        {
            // 尝试获取已删除的向量，应该会抛出异常
            auto vector = vt.getVectorFromId(id);
            std::cerr << "Error: Vector with ID " << id << " still exists after deletion." << std::endl;
            deletionCorrect = false;
        }
        catch (...)
        {
            // 预期会抛出异常，这是正确的
        }

        // 查询相似向量，确保已删除的ID不在结果中
        auto queryVector = testVectors[rand() % batchSize];
        auto queryResults = vt.querySimlar(queryVector, batchSize / 100); // 查询较多结果

        if (std::find(queryResults.first.begin(), queryResults.first.end(), id) != queryResults.first.end())
        {
            std::cerr << "Error: Deleted vector ID " << id << " still appears in query results." << std::endl;
            deletionCorrect = false;
        }
    }

    if (deletionCorrect)
    {
        std::cout << "All deletion verification tests passed." << std::endl;
    }
    else
    {
        std::cout << "Some deletion verification tests failed." << std::endl;
    }

    // 关闭表格
    vt.close();
    return deletionCorrect;
}

// 测试函数3: 测试向量检索的正确性和性能
bool testVectorRetrieval(const std::string &dbPath, int dimension, int testSize = 1000)
{
    std::cout << "\n========== VECTOR RETRIEVAL TEST ==========" << std::endl;

    // 创建表格
    VectorTable &vt = VectorTable::getInstance();
    std::string tableName = "retrieval_test";

    try
    {
        vt.createTable(dbPath, tableName, dimension);
        std::cout << "Table created for vector retrieval test." << std::endl;
    }
    catch (const std::exception &e)
    {
        std::cerr << "Error creating table: " << e.what() << std::endl;
        return false;
    }

    // 生成测试向量
    std::cout << "Generating " << testSize << " random vectors..." << std::endl;
    auto testVectors = generateRandomVectors(testSize, dimension);

    // 添加向量到表中
    std::cout << "Adding vectors to table..." << std::endl;
    std::vector<faiss::idx_t> ids = vt.addVector(testVectors);

    // 测试向量检索正确性
    std::cout << "Testing vector retrieval correctness..." << std::endl;
    bool allCorrect = true;
    int checkCount = std::min(100, testSize); // 检查一部分向量

    // 测量检索性能
    auto startRetrieval = std::chrono::high_resolution_clock::now();
    double totalError = 0.0;

    for (int i = 0; i < checkCount; i++)
    {
        int idx = i * (testSize / checkCount);
        try
        {
            auto retrievedVector = vt.getVectorFromId(ids[idx]);

            // 检查向量维度是否正确
            if (retrievedVector.size() != dimension)
            {
                std::cerr << "Error: Retrieved vector dimension mismatch for ID " << ids[idx] << std::endl;
                allCorrect = false;
                continue;
            }

            // 检查向量值是否正确(允许有极小误差)
            double error = 0.0;
            for (int j = 0; j < dimension; j++)
            {
                double diff = std::abs(retrievedVector[j] - testVectors[idx][j]);
                error += diff;
                if (diff > 1e-5)
                {
                    std::cerr << "Error: Vector value mismatch at dimension " << j
                              << " for ID " << ids[idx] << ": expected "
                              << testVectors[idx][j] << ", got " << retrievedVector[j] << std::endl;
                    allCorrect = false;
                    break;
                }
            }
            totalError += error;
        }
        catch (const std::exception &e)
        {
            std::cerr << "Error retrieving vector with ID " << ids[idx] << ": " << e.what() << std::endl;
            allCorrect = false;
        }
    }

    auto endRetrieval = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> retrievalTime = endRetrieval - startRetrieval;

    // 测试不存在的ID
    std::cout << "Testing retrieval of non-existent IDs..." << std::endl;
    bool correctErrorHandling = true;
    faiss::idx_t nonExistentId = *std::max_element(ids.begin(), ids.end()) + 1000;

    try
    {
        auto vector = vt.getVectorFromId(nonExistentId);
        std::cerr << "Error: Retrieved vector for non-existent ID " << nonExistentId << std::endl;
        correctErrorHandling = false;
    }
    catch (...)
    {
        // 预期会抛出异常，这是正确的
    }

    // 打印结果
    if (allCorrect)
    {
        std::cout << "[PASS] All vector retrieval tests passed!" << std::endl;
    }
    else
    {
        std::cout << "[FAIL] Some vector retrieval tests failed!" << std::endl;
    }

    if (correctErrorHandling)
    {
        std::cout << "[PASS] Error handling for non-existent IDs works correctly." << std::endl;
    }
    else
    {
        std::cout << "[FAIL] Error handling for non-existent IDs failed!" << std::endl;
    }

    std::cout << "Average error per vector: " << (totalError / checkCount) << std::endl;
    std::cout << "Retrieved " << checkCount << " vectors in "
              << std::fixed << std::setprecision(3) << retrievalTime.count()
              << " seconds (" << (retrievalTime.count() / checkCount * 1000)
              << " ms per vector)." << std::endl;

    // 关闭表格
    vt.close();
    return allCorrect && correctErrorHandling;
}

// 测试函数4: 测试索引重建功能的正确性和性能
bool testIndexReconstruction(const std::string &dbPath, int dimension, int testSize = 5000)
{
    std::cout << "\n========== INDEX RECONSTRUCTION TEST ==========" << std::endl;

    // 创建表格
    VectorTable &vt = VectorTable::getInstance();
    std::string tableName = "reconstruction_test";

    try
    {
        vt.createTable(dbPath, tableName, dimension);
        std::cout << "Table created for index reconstruction test." << std::endl;
    }
    catch (const std::exception &e)
    {
        std::cerr << "Error creating table: " << e.what() << std::endl;
        return false;
    }

    // 生成测试向量
    std::cout << "Generating " << testSize << " random vectors..." << std::endl;
    auto testVectors = generateRandomVectors(testSize, dimension);

    // 添加向量到表中
    std::cout << "Adding vectors to table..." << std::endl;
    std::vector<faiss::idx_t> ids = vt.addVector(testVectors);

    // 删除一些向量（制造"无效"记录）
    int deleteCount = testSize / 10; // 删除20%的向量
    std::cout << "Deleting " << deleteCount << " vectors to create invalid records..." << std::endl;

    std::vector<faiss::idx_t> deletedIds;
    for (int i = 0; i < deleteCount; i++)
    {
        int idx = rand() % ids.size();
        try
        {
            vt.removeVector(ids[idx]);
            deletedIds.push_back(ids[idx]);
        }
        catch (...)
        {
            // 忽略删除失败
        }
    }

    // 查询测试，记录重建前的性能
    std::cout << "Testing query performance before reconstruction..." << std::endl;
    auto queryVector = testVectors[rand() % testSize];

    auto startQueryBefore = std::chrono::high_resolution_clock::now();
    auto resultsBefore = vt.querySimlar(queryVector, 10);
    auto endQueryBefore = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> queryTimeBefore = endQueryBefore - startQueryBefore;

    // 获取无效ID
    std::cout << "Getting invalid IDs..." << std::endl;
    auto invalidIdsBefore = vt.getInvalidIds();
    std::cout << "Found " << invalidIdsBefore.size() << " invalid IDs before reconstruction." << std::endl;

    // 执行索引重建
    std::cout << "Reconstructing Faiss index..." << std::endl;
    auto startReconstruct = std::chrono::high_resolution_clock::now();

    int changedCount = vt.reconstructFaissIndex();

    auto endReconstruct = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> reconstructTime = endReconstruct - startReconstruct;

    std::cout << "Index reconstruction completed in "
              << std::fixed << std::setprecision(3) << reconstructTime.count()
              << " seconds. Changed " << changedCount << " records." << std::endl;

    // 再次获取无效ID，应该减少
    auto invalidIdsAfter = vt.getInvalidIds();
    std::cout << "Found " << invalidIdsAfter.size() << " invalid IDs after reconstruction." << std::endl;

    // 查询测试，记录重建后的性能
    std::cout << "Testing query performance after reconstruction..." << std::endl;
    auto startQueryAfter = std::chrono::high_resolution_clock::now();
    auto resultsAfter = vt.querySimlar(queryVector, 10);
    auto endQueryAfter = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> queryTimeAfter = endQueryAfter - startQueryAfter;

    // 验证重建后的查询结果不包含已删除的向量
    bool deletedVectorAbsent = true;
    for (auto id : resultsBefore.first)
    {
        if (std::find(deletedIds.begin(), deletedIds.end(), id) != deletedIds.end())
        {
            std::cout << "Warning: Deleted ID " << id << " found in query results before reconstruction." << std::endl;
        }
    }

    for (auto id : resultsAfter.first)
    {
        if (std::find(deletedIds.begin(), deletedIds.end(), id) != deletedIds.end())
        {
            std::cerr << "Error: Deleted ID " << id << " found in query results after reconstruction." << std::endl;
            deletedVectorAbsent = false;
        }
    }

    // 打印性能比较
    std::cout << "\nReconstruction Performance Impact:" << std::endl;
    std::cout << "------------------------------------------" << std::endl;
    std::cout << "Query time before: " << std::fixed << std::setprecision(3)
              << (queryTimeBefore.count() * 1000) << " ms" << std::endl;
    std::cout << "Query time after:  " << std::fixed << std::setprecision(3)
              << (queryTimeAfter.count() * 1000) << " ms" << std::endl;

    double querySpeedup = queryTimeBefore.count() / queryTimeAfter.count();
    if (querySpeedup > 1.0)
    {
        std::cout << "Query speedup:      " << std::fixed << std::setprecision(2)
                  << querySpeedup << "x faster after reconstruction" << std::endl;
    }
    else
    {
        std::cout << "Query slowdown:     " << std::fixed << std::setprecision(2)
                  << (1.0 / querySpeedup) << "x slower after reconstruction" << std::endl;
    }
    std::cout << "------------------------------------------" << std::endl;

    // 验证结果
    bool invalidIdsReduced = invalidIdsAfter.size() < invalidIdsBefore.size();

    if (deletedVectorAbsent)
    {
        std::cout << "[PASS] No deleted vectors found in query results after reconstruction." << std::endl;
    }
    else
    {
        std::cout << "[FAIL] Deleted vectors still found in query results after reconstruction." << std::endl;
    }

    // 关闭表格
    vt.close();
    return deletedVectorAbsent;
}

// 测试函数5: 测试边界情况和错误处理
bool testEdgeCases(const std::string &dbPath, int dimension)
{
    std::cout << "\n========== EDGE CASES AND ERROR HANDLING TEST ==========" << std::endl;

    VectorTable &vt = VectorTable::getInstance();
    std::string tableName = "edge_case_test";
    bool allTestsPassed = true;

    try
    {
        // 1. 测试创建表格
        vt.createTable(dbPath, tableName, dimension);
        std::cout << "[PASS] Table created successfully." << std::endl;

        // 2. 测试添加空向量集合
        std::cout << "Testing adding empty vector set..." << std::endl;
        bool emptySizeHandledCorrectly = false;
        try
        {
            std::vector<std::vector<float>> emptyVectors;
            vt.addVector(emptyVectors);
            std::cout << "[FAIL] Failed: Adding empty vector set did not throw an exception." << std::endl;
            allTestsPassed = false;
        }
        catch (...)
        {
            std::cout << "[PASS] Successfully caught exception when adding empty vector set." << std::endl;
            emptySizeHandledCorrectly = true;
        }

        // 3. 测试添加维度不匹配的向量
        std::cout << "Testing adding vector with wrong dimension..." << std::endl;
        bool wrongDimensionHandledCorrectly = false;
        try
        {
            std::vector<float> wrongDimVector(dimension + 10, 1.0f);
            vt.addVector(wrongDimVector);
            std::cout << "[FAIL] Failed: Adding wrong dimension vector did not throw an exception." << std::endl;
            allTestsPassed = false;
        }
        catch (...)
        {
            std::cout << "[PASS] Successfully caught exception when adding wrong dimension vector." << std::endl;
            wrongDimensionHandledCorrectly = true;
        }

        // 4. 测试删除不存在的向量
        std::cout << "Testing removing non-existent vector..." << std::endl;
        bool nonExistentIdHandledCorrectly = false;
        try
        {
            vt.removeVector(999999);
            std::cout << "[FAIL] Failed: Removing non-existent vector did not throw an exception." << std::endl;
            allTestsPassed = false;
        }
        catch (...)
        {
            std::cout << "[PASS] Successfully caught exception when removing non-existent vector." << std::endl;
            nonExistentIdHandledCorrectly = true;
        }

        // 5. 添加一些正常向量，以便进行后续测试
        std::cout << "Adding some normal vectors for further testing..." << std::endl;
        auto testVectors = generateRandomVectors(10, dimension);
        auto ids = vt.addVector(testVectors);

        // 6. 测试重复关闭表格
        std::cout << "Testing multiple close operations..." << std::endl;
        vt.close();
        try
        {
            vt.close(); // 第二次关闭，应该没有问题
            std::cout << "[FAIL] Failed: Second close operation threw an exception." << std::endl;
            allTestsPassed = false;
        }
        catch (...)
        {
            std::cout << "[PASS] Multiple close operations handled correctly." << std::endl;
        }

        // 7. 测试关闭后操作
        std::cout << "Testing operations after close..." << std::endl;
        bool closedStateHandledCorrectly = false;
        try
        {
            vt.addVector(testVectors[0]);
            std::cout << "[FAIL] Failed: Adding vector after close did not throw an exception." << std::endl;
            allTestsPassed = false;
        }
        catch (...)
        {
            std::cout << "[PASS] Successfully caught exception when adding vector after close." << std::endl;
            closedStateHandledCorrectly = true;
        }

        // 8. 重新打开表格并验证数据一致性
        std::cout << "Reopening table and verifying data consistency..." << std::endl;
        try
        {
            vt.open(dbPath, tableName);
            auto retrievedVector = vt.getVectorFromId(ids[0]);

            bool vectorConsistent = true;
            for (int j = 0; j < dimension; j++)
            {
                if (std::abs(retrievedVector[j] - testVectors[0][j]) > 1e-5)
                {
                    vectorConsistent = false;
                    break;
                }
            }

            if (vectorConsistent)
            {
                std::cout << "[PASS] Data consistency verified after reopen." << std::endl;
            }
            else
            {
                std::cout << "[FAIL] Failed: Vector data inconsistent after reopen." << std::endl;
                allTestsPassed = false;
            }
        }
        catch (const std::exception &e)
        {
            std::cerr << "Error reopening table: " << e.what() << std::endl;
            allTestsPassed = false;
        }

        // 最后关闭表格
        vt.close();
    }
    catch (const std::exception &e)
    {
        std::cerr << "Unexpected error in edge case tests: " << e.what() << std::endl;
        return false;
    }

    if (allTestsPassed)
    {
        std::cout << "\n[PASS] All edge case tests passed!" << std::endl;
    }
    else
    {
        std::cout << "\n[FAIL] Some edge case tests failed!" << std::endl;
    }

    return allTestsPassed;
}

int main(int argc, char *argv[])
{
    // 默认测试参数
    std::string dbPath = "./test";
    int dimension = 512;
    bool runSmallBatchTest = true;
    bool runLargeBatchTest = true;
    bool runRetrievalTest = true;
    bool runReconstructionTest = true;
    bool runEdgeCaseTest = true;

    // 可以通过命令行参数控制
    if (argc > 1)
        dbPath = argv[1];
    if (argc > 2)
        dimension = std::stoi(argv[2]);
    if (argc > 3)
    {
        int testFlags = std::stoi(argv[3]);
        runSmallBatchTest = (testFlags & 1) != 0;
        runLargeBatchTest = (testFlags & 2) != 0;
        runRetrievalTest = (testFlags & 4) != 0;
        runReconstructionTest = (testFlags & 8) != 0;
        runEdgeCaseTest = (testFlags & 16) != 0;
    }

    bool allTestsPassed = true;

    try
    {
        // 运行小批量性能测试
        if (runSmallBatchTest)
        {
            std::cout << "\nRunning small batch performance comparison test..." << std::endl;
            allTestsPassed &= testSmallBatchPerformance(dbPath, dimension);
        }

        // 运行大批量操作测试
        if (runLargeBatchTest)
        {
            std::cout << "\nRunning large batch operations test..." << std::endl;
            allTestsPassed &= testLargeBatchOperations(dbPath, dimension, 10000); // 使用较小的批量进行测试
        }

        // 运行向量检索测试
        if (runRetrievalTest)
        {
            std::cout << "\nRunning vector retrieval test..." << std::endl;
            allTestsPassed &= testVectorRetrieval(dbPath, dimension);
        }

        // 运行索引重建测试
        if (runReconstructionTest)
        {
            std::cout << "\nRunning index reconstruction test..." << std::endl;
            allTestsPassed &= testIndexReconstruction(dbPath, dimension);
        }

        // 运行边界情况测试
        if (runEdgeCaseTest)
        {
            std::cout << "\nRunning edge case test..." << std::endl;
            allTestsPassed &= testEdgeCases(dbPath, dimension);
        }
    }
    catch (const std::exception &e)
    {
        std::cerr << "\nUnexpected error in tests: " << e.what() << std::endl;
        allTestsPassed = false;
    }

    if (allTestsPassed)
    {
        std::cout << "\n============================" << std::endl;
        std::cout << "[PASS] All tests completed successfully!" << std::endl;
        std::cout << "============================" << std::endl;
    }
    else
    {
        std::cout << "\n============================" << std::endl;
        std::cout << "[FAIL] Some tests failed!" << std::endl;
        std::cout << "============================" << std::endl;
    }

    std::cout << "\nPress Enter to exit..." << std::endl;
    std::cin.get();

    return allTestsPassed ? 0 : 1;
}