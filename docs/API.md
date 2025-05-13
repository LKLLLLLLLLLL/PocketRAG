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
