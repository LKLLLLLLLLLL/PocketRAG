# LLMConv类设计文档
LLMConv类及其子类封装了对LLM的调用。

## 关于openai api
openai api基于http协议，使用json文件来交换数据。 

### 非流式传输

请求地址一般为：`https://api.openai.com/v1/chat/completions`。

请求头为：
```
Content-Type: application/json
Authorization: Bearer + api_key
```

请求体为一个json文件，格式大致如下：
```json
{
  "model": "deepseek-chat",
  "stream": false, //禁用流式传输
  "max_tokens": 100,
  "messages": [
    {
      "role": "system",
      "content": "你是一个有用的AI助手。"  // 可选的系统消息
    },
    {
      "role": "user",
      "content": "什么是量子计算？"  // 第一轮用户问题
    },
    {
      "role": "assistant",
      "content": "量子计算是利用量子力学原理进行信息处理的计算方式..."  // 第一轮AI回答
    },
    {
      "role": "user",
      "content": "它与经典计算有什么区别？"  // 第二轮用户问题
    }
    // 不包含最新的AI回答，这将由API生成
  ]
}
```

在非流式传输下，openai api会等待生成完成后，一次性返回整个回复。  
回复http状态码为200，包含一个json文件：
```json
{
  "id": "chatcmpl-123abc456def", //随机生成的标识符，唯一标识本次回答
  "object": "chat.completion", //返回的类型，与发出请求的网址相关联
  "created": 1698765432, //开始生成的时间戳(unix时间戳)
  "model": "deepseek-chat",
  "choices": [ // 包含所有候选回答，默认下只提供一个回答
    {
      "index": 0, //第几个回答，index就是几
      "message": {
        "role": "assistant",
        "content": "量子计算与经典计算的主要区别在于量子计算利用量子力学现象，如叠加态和纠缠态。经典计算机使用比特（0或1），而量子计算机使用量子比特，可以同时表示多个状态。这使得量子计算机能够并行处理指数级的信息，在某些特定算法（如Shor算法和Grover算法）上表现出显著优势。然而，量子计算面临量子退相干等物理挑战，目前仍处于发展阶段。"
      },
      "finish_reason": "stop" //记录了回答停止的原因，备选："stop"、"length"、"content_filter"、"function_call"等
    }
  ],
  "usage": {
    "prompt_tokens": 124,
    "completion_tokens": 235,
    "total_tokens": 359
  }
}
```

### 流式传输
通过在请求体中设置`"stream": true`，可以启用流式传输。流式传输会实时传输生成的token，达成类似于网络对话的逐字输出的效果。  

在流式传输下，openai api会分段返回类似于下面这样的相应：
```
data: {"id":"chatcmpl-123","choices":[{"delta":{"role":"assistant"},"index":0}]}\n\n
data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"量"},"index":0}]}\n\n
data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"子"},"index":0}]}\n\n
data: [DONE]\n\n
```
每个data后面都是一个json文件，只包含新生成的内容。  

由于网络包分包的不确定性，一个网络包可能只包含上面相应的一个片段，而curl又会在每接收到一个包的时候就调用回调函数，因此回调函数需要对于结果拼接，才能解析出完整的回答。

## 基本架构
LLMConv库包含以下主要类：

+ HttpClient: 处理底层HTTP通信，支持流式和非流式请求
+ LLMConv: 抽象基类，定义了与LLM交互的通用接口
+ OpenAIConv: 针对OpenAI风格API的实现
+ LlamacppConv: 针对本地LlamaCpp模型的实现(开发中)

## 使用方法
### 创建对话
```cpp
// 创建配置
LLMConv::Config config;
config["api_key"] = "YOUR_API_KEY";           // API密钥
config["api_url"] = "https://api.openai.com/v1/chat/completions"; // API端点
config["connect_timeout"] = "10";                // 最大等待时间
config["max_retry"] = "3";                    // 请求失败重试次数

// 创建对话实例
auto conv = LLMConv::createConv(
    LLMConv::type::OpenAIapi,      // API类型 
    "gpt-3.5-turbo",               // 模型名称
    config                         // 配置
);

// 修改对话模型等参数
conv->resetModel(LLMConv::type::OpenAIapi, "gpt-4", config, true); 
```
### 设置对话内容
```cpp
// 设置系统角色
conv->setMessage("system", "你是一个专业的AI助手。");

// 设置用户问题
conv->setMessage("user", "请简要解释量子计算的基本原理");

// 获取响应
std::string response = conv->getResponse();
std::cout << "AI: " << response << std::endl;
```
### 流式响应
```cpp
// 设置回调函数，实时处理生成的文本
conv->getStreamResponse([](const std::string &chunk) {
    std::cout << chunk << std::flush;  // 实时输出
});

std::cout << std::endl; // 输出完成后换行
```
### 导入/导出对话历史
```cpp
// 导出对话历史
std::vector<LLMConv::message> history = conv->exportHistory();

// 处理历史记录
for (const auto &message : history) {
    std::cout << message.role << ": " << message.content << std::endl;
}

// 导入对话历史到新会话
auto newConv = LLMConv::createConv(...);
newConv->importHistory(history);
```
### 修改请求参数
请求参数会被直接发送到api中，不会验证正确性。
```cpp
// 设置单个字符串参数
conv->setOptions("temperature", "0.7"); // 设置温度

// 设置数组参数
conv->setOptions("stop", {"。", "！", "？"}); // 设置多个停止标记
```
### 配置项
对于OpenAI API，支持的配置项包括：  
|配置项|类型|默认值|说明|
|---|---|---|---|
|api_key|string|必填|API密钥|
|api_url|string|必填|API端点|
|max_retry|int|3|请求失败重试次数|
|connect_timeout|int|10|连接超时时间，单位秒|
### 错误处理
LLMConv使用自定义异常类处理错误：
```cpp
try {
    auto conv = LLMConv::createConv(...);
    std::string response = conv->getResponse();
} 
catch (const LLMConv::Error &e) {
    switch (e.error_type) {
        case LLMConv::Error::ErrorType::Network:
            std::cerr << "网络错误: " << e.what() << std::endl;
            break;
        case LLMConv::Error::ErrorType::Authorization:
            std::cerr << "认证错误: " << e.what() << std::endl;
            break;
        // 处理其他错误类型...
        default:
            std::cerr << "未知错误: " << e.what() << std::endl;
    }
}
```
支持的错误类型:

+ Network: 网络连接问题
+ NotFound: 资源不存在
+ Authorization: 认证失败
+ RateLimit: 达到速率限制
+ Parser: 响应解析错误
+ InvalidArgument: 参数无效
+ Unknown: 未知错误