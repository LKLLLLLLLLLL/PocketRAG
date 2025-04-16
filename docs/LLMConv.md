# LLMClient类设计文档
LLMClient类极其子类封装了对LLM的调用。

## openai api
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

## 关于curl的使用
由于curl文档限制，必须保证在程序开始前调用`curl_global_init()`，在程序结束后调用`curl_global_cleanup()`。
在多线程环境下，`curl_global_init()`和`curl_global_cleanup()`只能在主线程中调用。

**应确保在使用LLMConv类之前已经调用过curl_global_init()**。