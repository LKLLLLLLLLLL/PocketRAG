## 前后端通信方式

electron通过node:child_process模块实现子进程启动，通过标准输入流向后端(c++)传入数据，格式为json字符串

## json文件格式及示例
### 一般情况:
此处electron向后端通信采用的格式形式化的如下
```
{
	type : 消息类型
	属性名称1 : 属性值1
	属性名称2 : 属性值2
	...
}
```
### 例子:
1. 选择仓库的json
```
{

    type : 'selectRepo',

    repoPath : filePaths[0]

}
```
`filePaths[0]`是一个路径字符串，表示仓库的路径，上面的对象会通过JSON.stringify转化成标准的json格式

2. 添加文件的json
```
{

            type : 'addFile',

            filePath : destPath

}
```
`destPath`也是一个路径字符串

3. 删除文件的json
```
{

            type : 'removeFile',

            filePath : filePaths[0]

}
```

4. 选择嵌入模型的json
```
{

    type : 'selectEmbeddingModel',

    embeddingModelPath : embeddingModel

}
```
`embeddingModel` 是模型的路径字符串

5. 查询的json
```
{

    type : 'query',

    content : query

}
```
`query` 是查询的内容，是一个字符串