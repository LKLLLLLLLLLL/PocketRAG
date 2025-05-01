#include <Split.h>
#include <iostream>
#include <ONNXModel.h>
#include <string>

int main(){
    setup_utf8_console();
    std::string markdownFile;
    std::cin >> markdownFile;

    std::cout << "-------------------------" << std::endl;
    std::cout << "input: " << markdownFile << std::endl;
    markdownSplit test(markdownFile, 300);
    std::vector<chunk> result = test.getchunk();
    std::cout << "-------------------------" << std::endl;
    for(auto& i : result){
        std::cout << i.content << std::endl;
        std::cout << i.position << std::endl;
        std::cout << "-------------------------" << std::endl;
    }
    return 0;
}