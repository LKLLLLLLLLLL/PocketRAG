#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>
#include <utility>
#include <vector>
#include <stack>


const size_t MAXSIZE = 1000000;
enum types{
    nul = 0, //normal text
    paragraph = 1,
    href = 2,
    ul = 3,
    ol = 4,
    li = 5,
    em = 6,
    strong = 7,
    hr = 8, //cutline
    image = 9,
    quote = 10,
    h1 = 11,
    h2 = 12,
    h3 = 13,
    h4 = 14,
    h5 = 15,
    h6 = 16,
    codeblock = 17,
    code = 18,
    latex = 19,
    latexblock = 20,
    del = 21, //delete line
    table = 22,
    empty = 23,
};

const std::string typeName[] = {
    "nul",
    "paragraph",
    "href",
    "ul",
    "ol",
    "li",
    "em",
    "strong",
    "hr",
    "image",
    "quote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "codeblock",
    "code",
    "latex",
    "latexblock",
    "delete",
    "table",
    "empty"
};

const std::vector<std::string> splitCriterion = {"\n", "。", "！", "？", ". ", "! ", "? ", "；", "; ", "，", ", "};

struct node{
    int type;
    std::vector<node*> ch;
    std::string element[3];
    node(int type_) : type(type_){}
};//markdown grammar tree

struct chunk{
    std::string content;
    std::string position;
    chunk(std::string content_ = "", std::string position_ = "") : content(content_), position(position_){}
};//split result which consists of its content and position

class markdownSplit{
private:
    std::stack<size_t> typecnt[sizeof(typeName)/sizeof(typeName[0])];//count how many times each type appears

    //std::vector<std::stack<size_t>> typecnt{sizeof(typeName)/sizeof(typeName[0]), {}};

    std::vector<chunk> ch,chk;//ch is the preprocess result and chk is the final result
    int length, criterionNumber;//the max length of the final result and criterionNumber used to select the split criterion
    node* root;
    bool isImage(node*);//to address image separately in dfs
    bool isHerf(node*);// the same reason as above
    int judgeType(char*);//to judge the type, and return the type number
    void insert(node*, const std::string&);//to deal with the format such as "*italic*" , "**strong**" in some types
    bool isCutline(char*);//to deal with cutline in the beginning
    void dfs(node*, std::string);//to output the preprocess result
    void destroy(node*);//to release memory
    node* findnode(int, node*);//to handle the nested format such as the ordered list and the unordered list
    bool isTableRow(const std::string&);//to identify the table row
    bool isSeparatorLine(const std::string&);//to identify the cutline of the table
    void finalProcess();//to generate the final result
    void finalDeepProcess(std::string, std::string);//to deeply generate the final result following the criterion if necessary

public:
    markdownSplit(const std::string&, const int&); //the process begins in the construction function
    ~markdownSplit();//the deconstruction function
    std::vector<chunk> getchunk(){return chk;}//to get the final result
};