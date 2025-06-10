# 此文档定义了界面与后端通信的API接口

所有通信都通过json文件传输，每一行表示一个消息。
大体格式如下：

```json
{
    "sessionId" : 120, // -1 - main.js, others - session id
    "toMain" : true, // true - to main thread(frontend or kernel server), false - to session thread or windows thread

    "callbackId" : 12, // -1 if no need for callbackfunction
    "isReply" : false, // true - reply message, false - request message

    "message" : {
        "type" : ...,
        ...
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : "" // if error, error message, else empty
    },

    "data" : {
        "items" : ...,
        ...
    }
}
```

关于callback的说明：
为了保证完整性，要求所有消息都要有返回值，即需要注册callback id。
因此，共有两类消息：

- 第一次发送的消息：
  - "callbackId" : 非-1的值
  - "isReply" : false
  - 无"status" "data"字段
- 对于回复的消息：
  - "callbackId" : 等于第一次发送的消息的callbackId
  - "isReply" : true
  - 包含"status"字段，可选"data"字段

关于status.code的说明：
有如下几种通用code，其余则在各类消息中定义

- SUCCESS 成功
- UNKNOW_ERROR 未知错误
- WRONG_PARAM 错误的参数
- INVALID_TYPE 无效的消息类型
- SESSION_NOT_FOUND 未找到与该windowId对应的session

# 消息具体分类以及内容

## 启动与停止相关
### stopAll  
main.js -> kernel server  
析构所有对象并安全退出。收到信息后立即返回，需要通过捕捉退出信号来确定是否成功退出。  

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "stopAll"
    }
}
```

return:

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "stopAll"
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

### ready
kernel server -> main.js  
kernel server准备完成，开始监听消息。  

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "ready"
    }
}
```

return:

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "ready"
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

### sessionPrepared
session -> window  
当Session初始化完成后，发送该消息给对应的窗口。  

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "sessionPrepared",
        "repoName" : "name",
        "path" : "/path/to/repo"
    }
}
```

return:

```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

### sessionCrashed
session -> window
Session崩溃，发送该消息给对应的窗口。  

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "sessionCrashed",
        "error" : "error message"
    }
}
```
可以不回复，此时session会自动销毁，所以回复消息也不会被接收。

### kernelServerCrashed
kernel server -> main.js
kernel server崩溃，发送该消息给主线程。 
由于错误的不确定性，并不一定所有退出都会成功发送该消息，具体是否崩溃请以child_process返回值为准。 

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "kernelServerCrashed",
        "error" : "error message"
    }
}
```
可以不回复，此时kernel server会退出，所以回复消息也不会被接收。
如果收到此消息，可以尝试重启kernel server。

## 仓库管理相关
### getRepos
main.js -> kernel server
获取仓库列表，返回全部仓库列表。

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "getRepos"
    }
}
```

return:

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "getRepos"
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    },

    "data" : {
        "repoList" : [
            {
                "name" : "repo1",
                "path" : "/path/to/repo1"
            },
            {
                "name" : "repo2",
                "path" : "/path/to/repo2"
            }
        ]
    }
}
```

### openRepo
main.js -> kernel server  
打开一个仓库并创建对应的session，并返回仓库路径。返回SUCCESS并不代表Session初始化成功，只有当窗口收到sessionPrepared消息后，才保证Session能够访问。  

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "openRepo",
        "repoName" : "name",
        "sessionId" : 120
    }
}
```

return:

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "openRepo",
        "repoName" : "name"
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    },

    "data" : {
        "repoName" : "name",
        "path" : "/path/to/repo",
    }
}
```

**可能的错误：**

- REPO_NOT_FOUND 仓库不存在
- SESSION_EXISTS 该sessionId已经打开了一个仓库，无法再绑定一个仓库
- REPO_NOT_EXIST 仓库文件夹不存在

### closeRepo
main.js -> kernel server  
关闭一个窗口对应的仓库并销毁对应的session。  

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "closeRepo",
        "sessionId" : 120
    }
}
```

return:

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "closeRepo",
        "windowId" : 120
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

**可能的错误：**

- SESSION_NOT_FOUND 未找到与该windowId对应的session

### createRepo
main.js -> kernel server  
创建一个新的仓库，不会创建Session。需要再次调用openRepo来打开对应的Session。  

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "createRepo",
        "repoName" : "name",
        "path" : "/path/to/repo"
    }
}
```

return:

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "createRepo",
        "repoName" : "name",
        "path" : "/path/to/repo",
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

**可能的错误：**

- INVALID_PATH 不合规的路径（eg. 无效路径、非绝对路径）
- REPO_NAME_NOT_MATCH 仓库名与路径中的仓库名不匹配
- REPO_NAME_EXIST 仓库名已存在

### deleteRepo
main.js -> kernel server
删除一个仓库，删除后无法恢复。  

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "deleteRepo",
        "repoName" : "name"
    }
}
```
return:
```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```
**可能的错误：**
- REPO_NOT_FOUND 仓库不存在

## 对话相关
### 对话历史记录
所有对话历史记录都应储存在`/userData/conversations`目录下，文件名为`conversation-<conversationId>.json`。  
前端可以直接读取该文件来获取历史记录，但写入由后端完成。历史记录文件中存储的内容应与对话时前端显示的内容一致。
```json
{
    "conversationId" : 1,
    "topic" : "topic",
    "history" : [
        { // 一轮对话
            "query" : "query string", // 用户输入
            "retrieval":[ // 多轮检索
                {
                    "annotation" : "explain the purpose of this retrieval", // 检索的目的
                    "search" : [  // 本次检索模型生成的搜索关键词
                        "keryword1",
                        "keryword2"
                    ],
                    "result" : [  // 搜索结果
                        {
                            "content" : "chunk content",
                            "metadata" : "metadata",
                            "beginLine" : 0,
                            "endLine" : 10,
                            "filePath" : "/path/to/file",
                            "score" : 0.9
                        },
                        {
                            ...
                        }
                    ]
                },
                {
                    ...
                }
            ],
            "answer" : "answer string", // LLM生成的回答
            "time" : 1234567890 // 时间戳
        },
        {
            ...
        }
    ]
}
```

### beginConversation
window -> session
发送对话消息，后端会流式返回结果。

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "beginConversation",
        "modelName" : "deepseek", // refer to localModelManagement
        "conversationId" : 1, // id to find history file
        "query" : "query string"
    }
}
```
return:

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "beginConversation",
        "conversationId" : 1,
        "query" : "query string"
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    },

    "data" : {
        "type" : "search",
        "content" : "content"
    }
}
```

```json
{
    ...
    "data" : {
        "type" : "result", // result 类型有着特殊的格式
        "content" : {
            "content" : "chunk content",
            "metadata" : "metadata",
            "beginLine" : 0,
            "endLine" : 10,
            "filePath" : "/path/to/file",
            "score" : 0.9
        }
    }
}
```
**共有几种类型的流式回复：**
- "search" 模型生成的搜索关键词等
- "annotation" 本次检索的目的
- "result" 搜索结果
- "answer" LLM生成的回答
- "doneRetrieval" 完成一次检索
- "done" 完成标志
不同类型的消息应渲染在不同位置，消息类型的发送顺序不固定，eg. search1 -> result1 -> doneRetrieve -> search2 -> result2 -> doneRetrieve -> answer -> done
如果出现错误，"status"字段会变成"NETWORK_ERROR"，并在"message"字段中返回错误信息。

### stopConversation
window -> session  
终止对话，后端会停止返回结果，最后一次返回的data.type将变为"done"。

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "stopConversation",
        "conversationId" : 1
    }
}
```
return:
```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```
## 其他通信

### search
window -> session  
在当前仓库中搜索，返回搜索结果  

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "search",
        "query" : "search string",
        "limit" : 10,
        "accuracy" : true // enable accuracy, may be very slow
    }
}
```

return:

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "search",
        "query" : "search string",
        "limit" : 10
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    },

    "data" : {
        "results" : [
            {
                "content" : "chunk content",
                "highlightedContent" : "highlighted content",
                "metadata" : "metadata",
                "highlightedMetadata" : "highlighted metadata",
                "beginLine" : 0,
                "endLine" : 10,
                "filePath" : "/path/to/file",
                "score" : 0.9
            },
            {
                ...
            }
        ]
    }
}
```




### embeddingStatus
session -> window
嵌入进度

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "embeddingStatus",
        "filePath" : "/path/to/file",
        "status" : "embedding", // embedding, done, if the file isn't changed, there will be no message about it
        "progress" : 0.5 // 1.0 do not mean done
    }
}
```

return:

```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

### getChunksInfo
window -> session
获取整个仓库的chunk信息

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "getChunksInfo"
    }
}
```

return:
```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "getChunksInfo"
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    },

    "data": {
        "chunkInfo" : [
            {
                "chunkId" : 1, // unique id for the chunk
                "filePath" : "/relative/path/to/file",
                "content" : "chunk content",
                "metadata" : "metadata",
                "beginLine" : 0, // begin line in the file
                "endLine" : 10, // end line in the file
                "embeddingName" : "bge-m3-512", // refer to config name 
            },
            {
                ...
            }
        ]
    }
}
```

# 关于设置
这些全局设置都应该由main.js向kernel server发送消息。
## 一般设置
通过写入userData/settings.json来设置，这些设置是全局的，各个仓库共享。
settings.json如下：
```json
{
    "searchSettings" : {
        "searchLimit" : 10, // 搜索结果数
        "embeddingConfig": {
            "configs" : [ // 可以有多个被选中
                {
                    "name" : "bge-m3-512", // unique name
                    "modelName" : "bge-m3", // refer to localModelManagement.name, NOT modelName
                    "inputLength" : 512,
                    "selected" : true
                },
                {
                    "name" : "bge-m3-1024",
                    "modelName" : "bge-m3",
                    "inputLength" : 1024,
                    "selected" : true
                }
            ]
        },
        "rerankConfig" : {
            "configs" : [ // 注意，只能有一个被选中，如果没有被选中的，则默认不进行rerank
                {
                    "modelName" : "bge-reranker-v2-m3", // refer to localModelManagement.name, NOT modelName
                    "selected" : true
                },
                {
                    "modelName" : "bge-reranker-m3",
                    "selected" : false
                }
            ]
        }
    },
    "localModelManagement" : {
        "models" : [
            {
                "name" : "bge-m3", // unique name
                "path" : "/path/to/bge-m3", // dir must exist
                "type" : "embedding", // embedding or rerank or generation
                "fileSize" : 2200, // in MB, calculated by frontend
            },
            {
                "name" : "bge-reranker-v2-m3",
                "path" : "/path/to/bge-reranker-v2-m3",
                "type" : "rerank",
                "fileSize" : 2200
            },
            {
                "name": "bge-reranker-m3",
                "path": "/path/to/bge-reranker-m3",
                "type": "rerank",
                "fileSize": 2200
            }
        ]
    },
    "conversationSettings" : {
        "generationModel" : [
            {
                "name" : "deepseek", // unique name
                "modelName" : "deepseek-chat",
                "url" : "http://...",
                "setApiKey" : true // api key is stored in the database, must be set by message when commit settings
            },
            {
                ...
            }
        ],
        "historyLength" : 1000, // 历史对话长度，单位为字符数量, 0 for no limit
    },
    "performance": {
        "maxThreads" : 0, // max threads for onnxruntime, 0 means max available threads
        "cuda available" : true, // this is not a setting, just indicate whether cuda choice can be selected
        "useCuda" : false, // whether to use cuda, if available
        "coreML available" : true, 
        "useCoreML" : false
    }
}
```
为了可读性，该文档可以不用格式化为一行。

### 更新设置流程
当settings.json更新后，前端应当分三步与kernel server进行通信：
1. 先将设置写入临时文件"settings-modified.json"发送消息"checkSettings"，检查临时设置是否正确。详见[checkSettings](#checkSettings)
2. 移动"settings-modified.json"到"settings.json"，覆盖原设置文件，发送消息"updateSettings"，更新设置。详见[updateSettings](#updateSettings)

### updateSettings
main.js -> kernel server
更新设置，设置的内容为settings.json的内容。

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "updateSettings"
    }
}
```
return:
```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

### checkSettings
main.js -> kernel server
检查设置，设置的内容为settings-modified.json的内容。

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "checkSettings"
    }
}
```
return:
```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

**可能的错误：**
- INVALID_SETTINGS 无效的消息类型

## 敏感信息
如api key等信息。
在更改后直接向后端发送，写入数据库。
### 写入apiKey
main.js -> kernel server
```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "setApiKey",
        "name" : "deepseek",
        "apiKey" : "apiKey"
    }
}
```
return:

```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```

### 读取apiKey
main.js -> kernel server
```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "getApiKey",
        "name" : "deepseek"
    }
}
```
return:

```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    },

    "data" : {
        "apiKey" : "apiKey"
    }
}
```

**可能的错误：**
- API_KEY_NOT_FOUND 未找到该模型名对应的数据，或该模型还未设置过apikey

### 测试apikey, url, modelname正确性
main.js -> kernel server  
当用户输入后，可以提供一个按钮来测试是否正确。  
```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "testApi",
        "modelName" : "deepseek",
        "url" : "http://...",
        "api" : "apiKey"
    }
}
```

return:
```json
{
    ...
    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    }
}
```
或是：
```json
{
    ...
    "status" : {
        "code" : "TESST_FAILED",
        "message" : "http error message"
    }
}
```

## 性能设置
由于性能设置需要访问硬件信息，因此比较特殊。
该设置的流程是：
1. 用户打开performance设置页面，main.js发送`getAvailableHardware`消息到kernel server；同时前端按照settings.json中缓存的available硬件信息来渲染页面。
2. 当后端返回可用的硬件信息时，main.js更新settings.json中的`performance`信息，并通知前端更新页面。
3. 当用户更改设置并保存后，后端不会验证"available"信息是否正确（因为改信息只影响显示效果），只会验证`coreML`和`cuda`的设置是否与实际可用性一致。

### getAvailableHardware
main.js -> kernel server
获取可用的硬件信息，返回是否支持cuda、coreML等。

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "getAvailableHardware"
    }
}
```

return:
```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "getAvailableHardware"
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    },

    "data" : {
        "cudaAvailable" : true, // 是否支持cuda
        "coreMLAvailable" : true // 是否支持coreML
    }
}
```


## 特殊页面：api用量信息
该用量信息是与仓库相关联的，并不是全局用量信息；该信息应单独显示在一个页面中。
window -> session
```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "getApiUsage"
    }
}
```
return:
```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : true,

    "message" : {
        "type" : "getApiUsage"
    },

    "status" : {
        "code" : "SUCCESS",
        "message" : ""
    },

    "data" : {
        "apiUsage" : [
            {
                "modelName" : "deepseek", // refer to modelName in localModelManagement, not name
                "input_token" : 1000,
                "output_token" : 2000,
                "total_token" : 3000
            },
            {
                ...
            }
        ]
    }
}
```