#include <ONNXmodel.h>
#include <iostream>
#include <iomanip>
#include <chrono>
#include <vector>
#include <string>
#include <map>
#include <algorithm>

// 计算余弦相似度
float cosine_similarity(const std::vector<float> &v1, const std::vector<float> &v2)
{
    float dot = 0.0, norm1 = 0.0, norm2 = 0.0;
    for (size_t i = 0; i < v1.size(); i++)
    {
        dot += v1[i] * v2[i];
        norm1 += v1[i] * v1[i];
        norm2 += v2[i] * v2[i];
    }
    return dot / (std::sqrt(norm1) * std::sqrt(norm2));
}

// 创建更多语义相似文本分组
std::map<std::string, std::vector<std::string>> create_test_texts()
{
    std::map<std::string, std::vector<std::string>> test_groups;

    // 技术/AI组
    test_groups["AI技术"] = {
        "深度学习是人工智能的一个分支，通过多层神经网络模拟人脑的学习过程，可以从大量数据中自动提取特征。深度学习模型如卷积神经网络和循环神经网络在图像识别、自然语言处理等领域取得了突破性进展。人工智能技术近年来发展迅速，特别是神经网络的应用使机器能够从数据中学习并做出决策。从图像分类到自然语言理解，深度学习算法已经在多个领域展示了超越传统方法的能力。",
        "机器学习是AI的核心技术，它使计算机系统能够通过经验自动改进。深度神经网络作为其中一种强大的方法，通过多层结构处理复杂数据，已经在语音识别、计算机视觉等任务上达到或超过人类水平。自然语言处理是计算机科学与人工智能的交叉领域，致力于让计算机理解人类语言。基于Transformer架构的模型如BERT和GPT在文本理解、生成和翻译等任务上表现出色，推动了智能助手和自动写作工具的发展。"};

    // 环境/气候变化组
    test_groups["环境保护"] = {
        "气候变化是当今人类面临的最严峻挑战之一，全球温室气体排放导致平均气温持续上升。极端天气事件、海平面上升和生态系统破坏正在威胁全球可持续发展和生物多样性。各国需要共同努力减少碳排放，发展可再生能源。地球环境保护刻不容缓，温室效应导致的全球变暖正在改变我们星球的面貌。北极冰盖融化、珊瑚礁白化和森林砍伐等现象表明生态系统正在遭受严重威胁，人类必须采取行动减少碳足迹。",
        "可持续发展要求在满足当代人需求的同时不损害后代人满足其需求的能力。环保政策应聚焦于减少碳排放、保护自然资源和推广循环经济，实现经济增长与环境保护的平衡。生物多样性是地球生态系统健康的基础，然而气候变化和人类活动正导致物种灭绝速度加快。保护野生动植物栖息地、减少污染和应对全球变暖对维护地球生命网络至关重要。"};

    // 文学/艺术组
    test_groups["文学艺术"] = {
        "文学作品通过精心构建的叙事和丰富的语言表达人类的情感和思想。从古典诗歌到现代小说，优秀的文学作品超越时空限制，探索人性的复杂性，反映社会现实，引发读者的共鸣和思考。",
        "艺术是人类情感和创造力的结晶，无论是绘画、音乐还是戏剧，都以独特的方式表达作者的内心世界。伟大的艺术作品往往能跨越文化和语言的障碍，唤起观众普遍的情感体验。",
        "戏剧艺术结合了文学、表演和视觉元素，通过角色、对话和舞台呈现故事。从古希腊悲剧到现代话剧，戏剧作品深入探讨人类境遇和社会问题，为观众提供思想和情感的体验。",
        "电影作为20世纪兴起的艺术形式，结合了视觉、声音和叙事等元素，成为强大的表达媒介。优秀电影不仅提供娱乐，还能探索深刻的主题，反映社会现实，引发观众对人生和世界的思考。"};

    // 健康/医疗组
    test_groups["健康医疗"] = {
        "良好的健康习惯对预防疾病至关重要。均衡饮食、定期锻炼、充足睡眠和管理压力都是维持身体健康的基本要素。随着生活方式疾病增加，人们需要更加关注这些基本的健康实践。",
        "现代医疗技术的进步使许多过去无法治疗的疾病现在可以得到有效控制。从精准医疗到微创手术，科技创新正在改变医疗实践，提高患者的生存率和生活质量。",
        "营养学研究表明，饮食对健康的影响远超过我们的想象。富含水果、蔬菜和全谷物的均衡饮食可以降低慢性疾病风险，而过多的加工食品和糖分则可能导致健康问题。",
        "心理健康与身体健康同等重要，但往往被忽视。抑郁症、焦虑症等心理问题需要专业治疗和社会支持。建立健康的心理状态需要自我关爱、社交联系和必要时寻求专业帮助。"};

    // 额外独立文本（不属于任何组）
    test_groups["其他"] = {
        "苹果公司是全球知名的科技企业，以其创新的产品设计和用户体验而闻名。从Macintosh电脑到iPhone智能手机，苹果不断推动消费电子行业的发展。",
        "篮球是一项全球流行的团队运动，需要球员具备速度、力量和策略思维。NBA作为世界顶级篮球联赛，吸引了来自全球的优秀球员和数以百万计的粉丝。",
        "中国有着悠久的历史和丰富的文化传统，包括哲学、文学、艺术和科技等多个方面的成就。从古代的四大发明到现代的经济发展，中国对世界文明做出了重要贡献。",
        "咖啡是世界上最受欢迎的饮料之一，其独特的风味和提神效果使它成为许多人日常生活的一部分。从埃塞俄比亚的发现到现代精品咖啡文化，这种饮料有着丰富的历史和文化内涵。"};

    return test_groups;
}

int main()
{
    try
    {
        // 设置控制台UTF-8编码
        setup_utf8_console();
        std::cout << "开始高级嵌入模型测试..." << std::endl;

        // 模型路径
        std::wstring model_path = L"D:\\Code\\PocketRAG\\models\\bge-m3\\";

        // 创建嵌入模型实例
        auto start = std::chrono::high_resolution_clock::now();
        EmbeddingModel model(model_path, ONNXModel::device::cpu, ONNXModel::perfSetting::high);
        auto end = std::chrono::high_resolution_clock::now();

        std::cout << "模型加载完成，耗时: "
                  << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count()
                  << " ms" << std::endl;
        std::cout << "嵌入维度: " << model.getDimension() << std::endl;

        // 获取测试文本组
        auto test_groups = create_test_texts();

        // 创建完整的文本列表（用于批处理）
        std::vector<std::string> all_texts;
        for (const auto &group : test_groups)
        {
            all_texts.insert(all_texts.end(), group.second.begin(), group.second.end());
        }

        std::cout << "总测试文本数量: " << all_texts.size() << std::endl;

        // 测试批量嵌入效率
        std::cout << "\n===== 批量处理效率测试 =====" << std::endl;
        start = std::chrono::high_resolution_clock::now();
        auto all_embeddings = model.embed(all_texts);
        end = std::chrono::high_resolution_clock::now();

        auto batch_time = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        std::cout << "批量处理" << all_texts.size() << "个文本耗时: " << batch_time
                  << " ms (平均每个文本 " << batch_time / all_texts.size() << " ms)" << std::endl;

        // 测试单个处理效率（只测试前3个文本）
        std::cout << "\n===== 单个处理效率对比 =====" << std::endl;
        start = std::chrono::high_resolution_clock::now();
        for (int i = 0; i < 3; i++)
        {
            model.embed(all_texts[i]);
        }
        end = std::chrono::high_resolution_clock::now();

        auto single_time = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        std::cout << "单个处理3个文本耗时: " << single_time
                  << " ms (平均每个文本 " << single_time / 3 << " ms)" << std::endl;
        std::cout << "批处理速度提升: " << std::fixed << std::setprecision(2)
                  << (static_cast<float>(single_time) / 3) / (static_cast<float>(batch_time) / all_texts.size())
                  << "x" << std::endl;

        // 语义相似性测试
        std::cout << "\n===== 语义相似性分析 =====" << std::endl;

        // 为每组文本创建索引映射
        std::map<std::string, std::vector<size_t>> group_indices;
        size_t idx = 0;
        for (const auto &group : test_groups)
        {
            for (size_t i = 0; i < group.second.size(); i++)
            {
                group_indices[group.first].push_back(idx++);
            }
        }

        // 计算组内平均相似度
        for (const auto &group : test_groups)
        {
            if (group.first == "其他")
                continue; // 跳过"其他"组

            float total_sim = 0.0f;
            int count = 0;
            const auto &indices = group_indices[group.first];

            for (size_t i = 0; i < indices.size(); i++)
            {
                for (size_t j = i + 1; j < indices.size(); j++)
                {
                    float sim = cosine_similarity(all_embeddings[indices[i]], all_embeddings[indices[j]]);
                    total_sim += sim;
                    count++;
                }
            }

            std::cout << "【" << group.first << "】组内平均相似度: "
                      << std::fixed << std::setprecision(4) << (total_sim / count) << std::endl;
        }

        // 计算组间随机样本相似度
        std::cout << "\n组间相似度对比（每组随机取样）:" << std::endl;
        std::vector<std::string> groups_to_compare = {"AI技术", "环境保护", "文学艺术", "健康医疗"};

        for (size_t i = 0; i < groups_to_compare.size(); i++)
        {
            for (size_t j = i + 1; j < groups_to_compare.size(); j++)
            {
                // 从每组随机选择一个样本
                size_t idx1 = group_indices[groups_to_compare[i]][0];
                size_t idx2 = group_indices[groups_to_compare[j]][0];

                float sim = cosine_similarity(all_embeddings[idx1], all_embeddings[idx2]);
                std::cout << "【" << groups_to_compare[i] << "】vs【" << groups_to_compare[j] << "】: "
                          << std::fixed << std::setprecision(4) << sim << std::endl;
            }
        }

        // 找出整个数据集中相似度最高和最低的两对文本
        float highest_sim = -1.0f;
        float lowest_sim = 2.0f;
        std::pair<size_t, size_t> most_similar;
        std::pair<size_t, size_t> least_similar;

        for (size_t i = 0; i < all_embeddings.size(); i++)
        {
            for (size_t j = i + 1; j < all_embeddings.size(); j++)
            {
                float sim = cosine_similarity(all_embeddings[i], all_embeddings[j]);

                if (sim > highest_sim)
                {
                    highest_sim = sim;
                    most_similar = {i, j};
                }

                if (sim < lowest_sim)
                {
                    lowest_sim = sim;
                    least_similar = {i, j};
                }
            }
        }

        std::cout << "\n===== 极值相似度分析 =====" << std::endl;
        std::cout << "最高相似度: " << std::fixed << std::setprecision(4) << highest_sim << std::endl;
        std::cout << "文本A: " << all_texts[most_similar.first].substr(0, 50) << "..." << std::endl;
        std::cout << "文本B: " << all_texts[most_similar.second].substr(0, 50) << "..." << std::endl;

        std::cout << "\n最低相似度: " << std::fixed << std::setprecision(4) << lowest_sim << std::endl;
        std::cout << "文本A: " << all_texts[least_similar.first].substr(0, 50) << "..." << std::endl;
        std::cout << "文本B: " << all_texts[least_similar.second].substr(0, 50) << "..." << std::endl;

        std::cout << "\n测试完成!" << std::endl;
    }
    catch (const std::exception &e)
    {
        std::cerr << "错误: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}