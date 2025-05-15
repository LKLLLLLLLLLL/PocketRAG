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

# 消息具体内容

## main.js -> kernel server

### stopAll

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

### getRepos

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

### closeRepo

关闭一个窗口对应的仓库并销毁对应的session。

```json
{
    "sessionId" : -1,
    "toMain" : true,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "closeRepo",
        "windowId" : 120
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

### updateSettings
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

## kernelServer -> main

### ready
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

## window -> session

### search

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

## session -> window

### sessionPrepared

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

### embeddingStatue

嵌入进度

```json
{
    "sessionId" : 120,
    "toMain" : false,

    "callbackId" : 42,
    "isReply" : false,

    "message" : {
        "type" : "embeddingStatue",
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

# 关于设置

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
                    "modelName" : "bge-m3", // refer to localModelManagement
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
            "configs" : [ // 注意，只能有一个被选中
                {
                    "modelName" : "bge-reranker-v2-m3", // refer to localModelManagement
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
                "modelName" : "deepseek",
                "url" : "http://...",
                "setApiKey" : true, // api key is stored in the database, must be set by message when commit settings
                "lastUsed" : true // last used model, only one can be true
            },
            {
                ...
            }
        ]
    }
}
```
为了可读性，该文档可以不用格式化为一行。

### 更新设置
当settings.json更新后，前端应当分三步与kernel server进行通信：
1. 先将设置写入临时文件"settings-modified.json"发送消息"checkSettings"，检查临时设置是否正确。详见[checkSettings](#checkSettings)
2. 移动"settings-modified.json"到"settings.json"，覆盖原设置文件，发送消息"updateSettings"，更新设置。详见[updateSettings](#updateSettings)

## 敏感信息
如api key等信息。
在更改后直接向后端发送，写入数据库。
### 写入apiKey
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