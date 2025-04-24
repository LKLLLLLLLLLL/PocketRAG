# Split设计文档
Split实现了按照一定的字数要求对一个markdown文本的划分，返回一个struct chunk的vector，chunk里面包含内容和位置

## 如何使用Split
Split定义了一个markdownSplit的类，构造函数为`markdownSplit(const std::string& filename, int& len)`其中filename是markdown文件的路径，len是指按照字数len进行划分。

可以通过getchunk()方法得到返回的chunk vector，chunk里面有成员content和position，分别是内容和位置，内容就是split出来的文本，position是这些文本位于markdown文件所生成的语法树的位置，用+号连接不同节点的位置所得全部的position，用"/"表示节点的父子关系。
eg: nul-1/ul-8/li-1/nul-1表示根下第八个无序列表的第一个表元素中的第一个普通文本， nul-1/ol-8/li-1/nul-1 + nul-1/ol-8/li-1/strong-1 + nul-1/ol-8/li-1/nul-2表示这个chunk来自根下第八个有序列表的第一个表元素的第一个普通文本以及第一个粗体以及第二个普通文本。

```
//这是所有的符号代表的含义
const std::string typeName[] = {

    "nul",//position第一个固定是nul表示树根，其余表示没有任何样式的纯文本

    "paragraph",//段落，里面会存nul和其它类型，本身没有文本

    "href",//超链接

    "ul",//无序列表，里面没有文本，只存li

    "ol",//有序列表，存储内容同上

    "li",//列表里面的元素，本身没有文本，会存nul等类型

    "em",//斜体文本，地位和nul一样，会存文本

    "strong",//粗体文本，地位也和nul一样

    "hr",//分割线

    "image",//图片

    "quote",//引用,里面不存文本，会存nul等类型

    "h1",//一级标题，里面不存文本，存nul等类型，以下标题同理

    "h2",

    "h3",

    "h4",

    "h5",

    "h6",

    "codeblock",//代码块，会存文本

    "code",//行内代码，会存文本

    "latex",//行内latex，会存文本

    "latexblock",//latex代码块，会存文本

    "delete",//删除线，会存文本

    "table",//表格，会存整个表格

    "empty"//空

};
```

## 实现原理
通过解析markdown语法，得到语法树，通过dfs遍历整个树能够按顺序存储文本，得到一个预处理chunk vector，再通过按照字数要求合并，字数过多则按照一定的标准进行递归深度分割再合并，最终也无法分割的话就直接按照字数顺序存储，比如最终有1000个字符，要求是300个，那么就会拆成 $300+300+300+100$ 