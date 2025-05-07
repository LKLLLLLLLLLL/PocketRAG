## 前后端通信方式

  electron通过node:child_process模块实现子进程启动，通过标准输入流向后端(c++)传入数据，格式为json字符串
## json文件格式及示例

### 前端向后端通信的json格式:

electron向后端通信采用的格式形式化的如下

```
{

    type : 消息类型,

    callback : 是否需要传回调,

    windowId : 窗口Id(以时间戳呈现),

    属性名称1 : 属性值1,

    属性名称2 : 属性值2,

    ...

}
```

### 例子:

1. 选择仓库的json

```
{

    type : 'selectRepo',

    callback : false,

    windowId : windowId,

    repoPath : filePaths[0]

}
```

`filePaths[0]`是一个路径字符串，表示仓库的路径，上面的对象会通过JSON.stringify转化成标准的json格式

2. 添加文件的json

```
{

            type : 'addFile',

            callback : false,

            windowId : windowId,

            filePath : destPath
  
}
```

`destPath`也是一个路径字符串

3. 删除文件的json

```
{
  
            type : 'removeFile',

            callback : false,

            windowId : windowId,

            filePath : filePaths[0]

}
```

4. 选择嵌入模型的json

```
{

    type : 'selectEmbeddingModel',

    callback : false,

    windowId : windowId,

    embeddingModelPath : embeddingModel
  
}
```

`embeddingModel` 是模型的路径字符串

5. 查询的json

```
{
  
    type : 'query',

    callback : true,

    windowId : windowId,

    content : query
  
}
```

`query` 是查询的内容，是一个字符串

### 后端向前端通信的json格式:

  

后端c++向前端electron通信的格式也形式化地如下

```
{

    type : 消息类型,

    callback : 是否需要传回调,

    windowId : 窗口Id,

    属性名称1 : 属性值1,

    属性名称2 : 属性值2,

    ...

}
```

#### 一些消息类型的命名：
- 模型嵌入的进度：`embedding`
- 查询结果：`queryResult`