# 此文档定义了界面与后端同行的API接口
所有同行都通过json文件传输，每一行表示一个消息。
大体格式如下：
```json
{
    "windowsId" : 120, // 0 - main.js, others - windows id
    "toMain" : true, // true - to main thread(frontend or kernel server),
    // false - to session thread or windows thread

    "needCallback" : true,
    "isReply" : false,
    "callbackId" : 12,

    "message" : {
        "type" : ...,
        ...
    }
}
```

## 