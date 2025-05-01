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
#include <memory>
#include <Split.h>

bool markdownSplit::isImage(node* v){return v->type == image;}
bool markdownSplit::isHerf(node* v){return v->type == href;}

int markdownSplit::judgeType(char* s){
    char* ptr = s;
    while(*ptr == '#')ptr++;
    if(*ptr == ' ' && ptr - s > 0){
        return ptr - s + h1 -1 > h6 ? paragraph : ptr - s + h1 -1;
    }//title h1~h6

    ptr = s;
    if(strncmp(ptr, "```", 3) == 0){
        return codeblock;
    }//codeblock

    if(strncmp(ptr, "- ", 2) == 0 || strncmp(ptr, "* ", 2) == 0 || strncmp(ptr, "+ ", 2) == 0){
        return ul;
    }//unordered list

    if(strncmp(ptr, "> ", 2) == 0){
        return quote;
    }//quote

    char* ptr1 = ptr;
    while(*ptr1 && (isdigit((unsigned char)*ptr1)))ptr1++;
    if(ptr1 != ptr && *ptr1 == '.' && ptr1[1] == ' '){
        return ol;
    }//ordered list

    if(strncmp(ptr, "$$", 2) == 0){
        return latexblock;
    }//latexblock

    return paragraph;//otherwise paragragh
}

void markdownSplit::insert(node* v, const std::string& s){
    int n = (int)s.size();
    bool incode = false, inem = false, instrong = false, inlatex = false, indel = false;
    int firstin = 0;
    v->ch.push_back(new node(nul));

    for(int i = 0; i < n; i++){
        char c = s[i];

        if(c == '`'){
            if(incode)v->ch.back()->element[0] += "`";
            incode ? v->ch.push_back(new node(nul)) : v->ch.push_back(new node(code));
            if(!incode)v->ch.back()->element[0] += "`";
            incode = !incode;
            continue;
        }//code

        if(firstin == strong && inem){
            if(c == '*' && !incode && !inlatex && !indel && ((i < n - 1 && s[i + 1] != ' ' && !inem) || (i > 0 && s[i - 1] != ' ' && inem))){
                if(instrong && firstin == strong){
                    if(inem)v->ch.back()->ch.back()->element[0] += "*";
                    inem ? v->ch.push_back(new node(strong)) : v->ch.back()->ch.push_back(new node(em));
                    if(!inem)v->ch.back()->ch.back()->element[0] += "*";
                }
                else{
                    if(inem)v->ch.back()->element[0] += "*", firstin = 0;
                    inem ? v->ch.push_back(new node(nul)) : v->ch.push_back(new node(em));
                    if(!inem)v->ch.back()->element[0] += "*", firstin = em;
                }
                inem = !inem;
                continue;
            }
            if(c == '*' && (i < n - 1 && s[i + 1] == '*') && !incode && !inlatex && !indel){
                i++;
                if(inem && firstin == em){
                    if(instrong)v->ch.back()->ch.back()->element[0] += "**";
                    instrong ? v->ch.push_back(new node(em)) : v->ch.back()->ch.push_back(new node(strong));
                    if(!instrong)v->ch.back()->ch.back()->element[0] += "**";
                }
                else{
                    if(instrong)v->ch.back()->element[0] += "**", firstin = 0;
                    instrong ? v->ch.push_back(new node(nul)) : v->ch.push_back(new node(strong));
                    if(!instrong)v->ch.back()->element[0] += "**", firstin = strong;
                }
                instrong = !instrong;
                continue;
            }
        }//to deal with the em in strong in the situation "***em and strong***"

        if(c == '*' && (i < n - 1 && s[i + 1] == '*') && !incode && !inlatex && !indel){
            i++;
            if(inem && firstin == em){
                if(instrong)v->ch.back()->ch.back()->element[0] += "**";
                instrong ? v->ch.push_back(new node(em)) : v->ch.back()->ch.push_back(new node(strong));
                if(!instrong)v->ch.back()->ch.back()->element[0] += "**";
            }
            else{
                if(instrong){v->ch.back()->element[0] += "**"; firstin = 0;}
                instrong ? v->ch.push_back(new node(nul)) : v->ch.push_back(new node(strong));
                if(!instrong){v->ch.back()->element[0] += "**"; firstin = strong;}
            }
            instrong = !instrong;
            continue;
        }//to deal with the strong in em and normal strong

        if(c == '*' && !incode && !inlatex && !indel && ((i < n - 1 && s[i + 1] != ' ' && !inem) || (i > 0 && s[i - 1] != ' ' && inem))){
            if(instrong && firstin == strong){
                if(inem)v->ch.back()->ch.back()->element[0] += "*";
                inem ? v->ch.push_back(new node(strong)) : v->ch.back()->ch.push_back(new node(em));
                if(!inem)v->ch.back()->ch.back()->element[0] += "*";
            }
            else{
                if(inem){v->ch.back()->element[0] += "*"; firstin = 0;}
                inem ? v->ch.push_back(new node(nul)) : v->ch.push_back(new node(em));
                if(!inem){v->ch.back()->element[0] += "*"; firstin = em;}
            }
            inem = !inem;
            continue;
        }//to deal with the em in strong and normal em

        if(c == '!' && ((i < n - 1 && s[i + 1] == '[')) && !incode && !inlatex && !instrong && !inem && !indel){
            v->ch.push_back(new node(image));
            for(i = i + 2; i < n - 1 && s[i] != ']'; i++){
                v->ch.back()->element[0] += std::string(1, s[i]);
            }
            i++;

            for(i = i + 1; i < n - 1 && s[i] != ' ' && s[i] != ')'; i++){
                v->ch.back()->element[1] += std::string(1, s[i]);
            }

            if(s[i] != ')'){
                for(i = i + 1; i < n - 1 && s[i] != ')'; i++){
                    v->ch.back()->element[2] += std::string(1, s[i]);
                }
            }
            v->ch.push_back(new node(nul));
            continue;
        }//image

        if (c == '[' && !incode && !inlatex && !instrong && !inem && !indel){
            v->ch.push_back(new node(href));
            for (i = i + 1; i < n - 1 && s[i] != ']'; i++){
                v->ch.back()->element[0] += std::string(1, s[i]);
            }
            i++;

            for (i = i + 1; i < n - 1 && s[i] != ' ' && s[i] != ')'; i++){
                v->ch.back()->element[1] += std::string(1, s[i]);
            }

            if (s[i] != ')'){
                for (i++; i < n - 1 && s[i] != ')'; i++){
                    v->ch.back()->element[2] += std::string(1, s[i]);
                }
            }
            v->ch.push_back(new node(nul));
            continue;
        }//href
        
        if(c == '$' && (i < n - 1 && s[i + 1] != '$') && !incode && !instrong && !inem && !indel){
            if(inlatex)v->ch.back()->element[0] += "$";
            inlatex ? v->ch.push_back(new node(nul)) : v->ch.push_back(new node(latex));
            if(!inlatex)v->ch.back()->element[0] += "$";
            inlatex = !inlatex;
            continue;
        }//latex

        if(c == '~' && (i < n - 1 && s[i + 1] == '~') && !incode && !instrong && !inem && !inlatex){
            if(indel)v->ch.back()->element[0] += "~~";
            indel ? v->ch.push_back(new node(nul)) : v->ch.push_back(new node(del));
            if(!indel)v->ch.back()->element[0] += "~~";
            indel = !indel;
            i++;
            continue;
        }//delete line
        
        if(instrong && inem)v->ch.back()->ch.back()->element[0] += std::string(1,c);
        else v->ch.back()->element[0] += std::string(1, c);//insert char
    }

}

bool markdownSplit::isCutline(char* s){
    int cnt = 0;
    char* ptr = s;
    while(*ptr){
        if(*ptr == '-')cnt++;
        else break;
        ptr++;
    }
    return cnt >= 3;
}

void markdownSplit::dfs(node* v, std::string position){
    if(v->type == paragraph && v->element[0].empty() && v->ch.empty()){
        return;
    }

    bool flag = true;
    typecnt[v->type].top()++;

    if(isHerf(v)){
        chunk tmp;
        tmp.content = "[" + v->element[0] + "]" + "(" + v->element[1] + " " + v->element[2] + ")";
        tmp.position = position + typeName[v->type] + "-" + std::to_string(typecnt[v->type].top());
        ch.push_back(tmp);
        flag = false;
    }

    if(isImage(v)){
        chunk tmp;
        tmp.content = "![" + v->element[0] + "]" + "(" + v->element[1] + " " + v->element[2] + ")";
        tmp.position = position + typeName[v->type] + "-" + std::to_string(typecnt[v->type].top());
        ch.push_back(tmp);
        flag = false;
    }

    if(flag && v->element[0].size() != 0){
        chunk tmp;
        tmp.content = v->element[0];
        tmp.position = position + typeName[v->type] + "-" + std::to_string(typecnt[v->type].top());
        ch.push_back(tmp);
    }

    int tmp = typecnt[v->type].top();
    for(int i = 0; i < sizeof(typeName)/sizeof(typeName[0]); i++){
        typecnt[i].push(0);
    }
    
    for(int i = 0; i < (int)v->ch.size(); i++){
        dfs(v->ch[i], position + typeName[v->type] + "-" + std::to_string(tmp) + "/");
    }

    for(int i = 0; i < sizeof(typeName)/sizeof(typeName[0]); i++){
        if(!typecnt[i].empty())typecnt[i].pop();
    }

}// dfs algorithm to output each node

bool markdownSplit::isTableRow(const std::string& line){
    return line.find('|') != std::string::npos;
}

bool markdownSplit::isSeparatorLine(const std::string& line){
    if (line.find('|') == std::string::npos) return false;

    bool hasSeparator = false;
    size_t start = line.find('|');
    while (start != std::string::npos){
        size_t end = line.find('|', start + 1);
        if (end == std::string::npos) break;

        std::string cell = line.substr(start + 1, end - start - 1);
        if (cell.find("-") != std::string::npos || 
            cell.find(":-:") != std::string::npos || 
            cell.find(":-") != std::string::npos || 
            cell.find("-:") != std::string::npos) {
            hasSeparator = true;
        }
        else{
            hasSeparator = false;
            break;
        }
        start = end;
    }
    return hasSeparator;
}

markdownSplit::markdownSplit(const std::string& filename,const int& len){
    this->length = len;
    root = new node(nul);
    std::ifstream fin(filename);
    if(!fin.is_open()){
        throw std::runtime_error("could not open file: " + filename);
    }
    bool incodeblock = false;
    bool inlatexblock = false;
    char s[MAXSIZE];
    std::vector<std::string> lines;//to save the input
    std::string line;//a single line of the input

    while(std::getline(fin, line))lines.push_back(line);
    auto it = lines.begin();

    while(it != lines.end()){
        if(strlen(it->c_str()) <= MAXSIZE - 1)strcpy(s, it->c_str());
        else throw std::runtime_error("the line is too long");
        it++;

        int tabcnt = 0, spacecnt = 0;
        char* temp = s;
        while(temp){
            if(*temp == ' ' || *temp == '\t'){
                if(*temp == '\t')tabcnt++;
                if(*temp == ' ')spacecnt++;
                temp++;
            }
            else break;
        }//count tab number to deal with the nested
       
        node* now = findnode(tabcnt + spacecnt / 4, root);

        if(!incodeblock && *temp == '\0'){
            continue;
        }//if there is no content, skip

        bool istable = true;
        auto current = it - 1;
        if(current + 1 == lines.end() || !isTableRow(current[0]) || !isSeparatorLine(current[1]))istable = false;
        if(istable){
            now->ch.push_back(new node(table));
            int j;
            for(j = 0; (it + j != lines.end()) && (isTableRow(current[j]) || isSeparatorLine(current[j])); j++){
                now->ch.back()->element[0] += std::string(current[j]) + "\n";
            }
            it += j;
            continue;
        }//to deal with table


        if(!incodeblock && isCutline(s)){
            now->ch.push_back(new node(hr));
            now->ch.back()->element[0] += std::string(s) + "\n";
            continue;
        }//cutline

        int typeJudge = judgeType(temp);

        if(typeJudge == codeblock){

            if(!incodeblock){
                now->ch.push_back(new node(codeblock));
            }
            now->ch.back()->element[0] += std::string(s) + "\n";
            incodeblock = !incodeblock;
            continue;
        }
        if(incodeblock){
            now->ch.back()->element[0] += std::string(s) + "\n";
            continue;
        }//codeblock

        if(typeJudge == latexblock){

            if(!inlatexblock){
                now->ch.push_back(new node(latexblock));
            }
            now->ch.back()->element[0] += std::string(s) + "\n";
            inlatexblock = !inlatexblock;
            continue;
        }
        if(inlatexblock){
            now->ch.back()->element[0] += std::string(s) + "\n";
            continue;
        }//latexblock

        if(typeJudge == paragraph){
            now->ch.push_back(new node(paragraph));
            insert(now->ch.back(), std::string(s) + "\n");
            continue;
        }//paragraph

        if(typeJudge >= h1 && typeJudge <= h6){
            now->ch.push_back(new node(typeJudge));
            insert(now->ch.back(), std::string(s) + "\n");
            continue;
        }//title h1~h6

        if(typeJudge == ul){

            if(now->ch.empty() || now->ch.back()->type != ul){
                now->ch.push_back(new node(ul));
            }

            node* v = now->ch.back();
            v->ch.push_back(new node(li));

            insert(v->ch.back(), std::string(s) + "\n");
        }//unordered list

        if(typeJudge == ol){
            if(now->ch.empty() || now->ch.back()->type != ol){
                now->ch.push_back(new node(ol));
            }
            node* v = now->ch.back();
            v->ch.push_back(new node(li));
            insert(v->ch.back(), std::string(s) + "\n");
            continue;
        }//ordered list
        
        if(typeJudge == quote){
            now->ch.push_back(new node(quote));
            insert(now->ch.back(), std::string(s) + "\n");
            
        }//quote
        
    }
    fin.close();
    for(int i = 0; i < sizeof(typeName)/sizeof(typeName[0]); i++){
        typecnt[i].push(0);
    }
    dfs(root, "");
    for(int i = 0; i < sizeof(typeName)/sizeof(typeName[0]); i++){
        typecnt[i].pop();
    }

    criterionNumber = 0;
    finalProcess();
}

void markdownSplit::destroy(node* v){
    if(v){
        for(node* ch : v->ch){
            destroy(ch);
        }
        delete v;
    }
}

markdownSplit::~markdownSplit(){
    if(root)destroy(root);
}

node* markdownSplit::findnode(int deep, node* current){
    if(deep < 0){
        throw std::runtime_error("invalid deep");
    }

    if(current->type == ol || current->type == ul)return findnode(deep, current->ch.back());//skip ol and ul because texts are nested in li

    if(deep == 0)return current;

    if(!current->ch.empty()){
        if(current->ch.back()->type == codeblock || current->type == latexblock || current->ch.back()->type == paragraph || current->ch.back()->type == nul)return findnode(deep - 1, current);//don't need to deal with the nested
        else return findnode(deep - 1, current->ch.back());
    }
    else{
        current->ch.push_back(new node(empty));
        return findnode(deep - 1, current->ch.back());
    }
}

void markdownSplit::finalProcess(){
    chunk tmp;
    for(int i = 0; i < (int)ch.size(); i++){
        if(tmp.content.length() + ch[i].content.length() <= length){
            tmp.content += ch[i].content;
            tmp.position += ch[i].position;
            if((i + 1 < (int)ch.size()) && (tmp.content.length() + ch[i + 1].content.length() <= length)){
                tmp.position += " + ";
            }
        }//combine the content if the total length is no more than the max split length
        else{
            if(tmp.content.length() != 0){
                chk.push_back(tmp);
                tmp.content = "";
                tmp.position = "";
                i--;
            }//store the chunk
            else{
                finalDeepProcess(ch[i].content, ch[i].position);
                criterionNumber = 0;
            }//if it can't be split according to the grammar tree, the deep process will start
        }
    }
    if(tmp.content.length() != 0)chk.push_back(tmp);//last content
}

void markdownSplit::finalDeepProcess(std::string content, std::string pos){
    chunk tmp;

    if(criterionNumber >= splitCriterion.size()){
        int stringLength= content.length();
        int part = stringLength / length;
        for(int i = 1; i <= part; i++){
            tmp.content = content.substr((i - 1) * length, length);
            tmp.position = pos;
            chk.push_back(tmp);
        }
        if(content.substr(part * length, stringLength - part * length).length() != 0){
            tmp.content = content.substr(part * length, stringLength - part * length);
            tmp.position = pos;
            chk.push_back(tmp);
        }
        return;
    }//if the content doesn't belong to any criterion, split evenly

    size_t start = content.find(splitCriterion[criterionNumber]);
    std::string substring = start == std::string::npos ? content.substr(0) : content.substr(0, start + splitCriterion[criterionNumber].length());//prevent being out of range

    if(tmp.content.length() + substring.length() <= length){
        tmp.content += substring;
        tmp.position = pos;
    }
    else{
        if(tmp.content.length() != 0){
            chk.push_back(tmp);
            tmp.content = "";
            tmp.position = "";
        }
        else{
            criterionNumber++;
            finalDeepProcess(substring, pos);
            criterionNumber--;
        }
    }//the first substring

    while(start != std::string::npos){
        size_t end = content.find(splitCriterion[criterionNumber], start + splitCriterion[criterionNumber].length());
        substring = end == std::string::npos ? content.substr(start + splitCriterion[criterionNumber].length()) : content.substr(start + splitCriterion[criterionNumber].length(), end - start);//prevent being out of range

        if(tmp.content.length() + substring.length() <= length){
            tmp.content += substring;
            tmp.position = pos;
        }
        else{
            if(tmp.content.length() != 0){
                chk.push_back(tmp);
                tmp.content = "";
                tmp.position = "";
                continue;
            }
            else{
                criterionNumber++;
                finalDeepProcess(substring, pos);//split recursively
                criterionNumber--;
            }
        }
        start = end;
    }//middle substrings
    if(tmp.content.length() != 0)chk.push_back(tmp);//last substring
}