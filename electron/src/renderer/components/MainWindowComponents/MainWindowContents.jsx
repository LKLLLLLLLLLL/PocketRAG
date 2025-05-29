import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import React, { useState } from "react";
import Doclist from "../../templates/Doclist/Doclist";
import LeftBar from "./LeftBar/LeftBar";
import "./MainWindowContents.css";
export default function MainWindowContents() {
    const [content, setContent] = useState('');// recognize the content of the main window, either 'conversation' or 'search'
    const [inputValue, setInputValue] = useState('');// record the input value
    const [showResult, setShowResult] = useState(false);// whether to show the search result
    const [isLoading,setIsLoading] = useState(false);// whether the search is loading
    const [isTimeout, setIsTimeout] = useState(false);// whether the search is timeout
    const [searchResult, setSearchResult] = useState([]);// record the search result
    const [selectedResultIndex, setSelectedResultIndex] = useState(null);// record the selected result index
    const [lastClickTime,setLastClickTime] = useState(0);//record the last click time

    const handleOnChange = (event) =>{
        setInputValue(event.target.value);
        // console.log(value);
    }

    const handleKeyPress = async (e) => {
        if (e.key === 'Enter') {
            setShowResult(true);
            setIsLoading(true);
            setIsTimeout(false);
            // console.log(value);
            try{
                let result = await window.search(inputValue,true);
                // console.log(result);
                setSearchResult(result);
            }
            catch(error){
                if(error && error.message && error.message.includes('timeout') ){
                    setIsTimeout(true);
                }
            }
            finally{
                setIsLoading(false);
            }
        }
    };

    const handleConversation = () => {
        setContent('conversation');
    }

    const handleSearch = () => {
        setContent('search');
    }

    const resultItem0 = searchResult.map((item,index) => {
        return(
            <li key = {index}
                className = {`result0-item ${selectedResultIndex === index ? 'selected' : ''}`}
                onClick = {()=>setSelectedResultIndex(index)}>
                    <div className = 'result0-item-container'>
                        <div className = 'chunkcontent-container'>
                            分块内容:
                            {item.content}
                        </div>
                        <div className = 'metadata-container'>
                            元数据:
                            {item.metadata}
                        </div>
                        <div className = 'position-container'>
                            分块起始行和终止行:
                            {item.beginLine}
                            {item.endLine}
                        </div>
                        <div className = 'filepath-container'>
                            分块所在文件路径:
                            {item.filePath}
                        </div>
                        <div className = 'score-container'>
                            分块得分:
                            {item.score}
                        </div>
                    </div>
            </li>
        )
    })

    return (
        <div style = {{flex: 1, display: 'flex'}}>
            <LeftBar handleConversation = {handleConversation}
                    handleSearch = {handleSearch}>
            </LeftBar>
            <div style ={{flex: 1, display: 'flex'}}>
                <PanelGroup direction="horizontal">
                    <Panel minSize={20} maxSize={70} defaultSize={30}>
                        <Doclist></Doclist>
                    </Panel>
                    <PanelResizeHandle></PanelResizeHandle>
                    <Panel minSize={30} maxSize={80} defaultSize={70} style = {{display: 'flex', flexDirection: 'column'}}>
                        <div className = 'biaoqian'>标签栏</div>
                        <MainDemo   content = {content} 
                                    inputValue = {inputValue}
                                    isLoading = {isLoading}
                                    resultItem = {resultItem0}
                                    showResult = {showResult}
                                    isTimeout = {isTimeout}
                                    onChange = {handleOnChange}
                                    onKeyDown = {handleKeyPress}
                                    style = {{flex: 1, display: 'flex'}}>
                        </MainDemo>
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    )
}
const MainDemo = ({content,inputValue,resultItem,onChange,onKeyDown,isLoading,showResult,isTimeout}) => {
    switch (content) {
        case 'conversation':
            return (
                <div style = {{display: 'flex',flex: 1}}>
                    <PanelGroup direction="vertical" style = {{flex: 1}}>
                        <Panel minSize = {30} maxSize = {80} defaultSize = {70} style = {{display: 'flex'}}>
                            <div className = 'conversation-container'>
                                <div>
                                    conversation
                                </div>
                            </div>
                        </Panel>
                        <PanelResizeHandle></PanelResizeHandle>
                        <Panel minSize = {20} maxSize = {70} defaultSize = {30} style = {{display: 'flex'}}>
                            <div className = 'question-input' style = {{backgroundColor: '#444444',flex: 1, display: 'flex'}}>
                                问题输入
                            </div>
                        </Panel>
                    </PanelGroup>
                </div>
            );
        case 'search':
            return (
                <div style = {{flex: 1, display: 'flex',flexDirection: 'column'}}>
                    <div className = 'searchinput-container'>
                        <input  type = 'text' 
                                placeholder= '请输入内容，按回车以继续'
                                className = 'searchinput'
                                value = {inputValue}
                                onChange = {onChange}
                                onKeyDown = {onKeyDown}>
                        </input>
                    </div>
                    <div className = 'searchresult-container'>
                        <div className = 'explanation'>
                            <div className="explanation">
                                {isTimeout ? <div>请求超时</div>: 
                                ((!isLoading && showResult) ? <div>结果如下</div>:
                                ((isLoading && !showResult) ? <div>加载中</div>:<div>请进行搜索</div>))}
                            </div>
                        </div>
                        {!isLoading && showResult && 
                            <ul>
                                {resultItem.length > 0 ? resultItem : <li>未找到结果</li>}
                            </ul>
                        }
                    </div>
                </div>
            );
        default:
            return (
                <div>
                    <h2>Welcome</h2>
                    <p>Select a feature from the left bar.</p>
                </div>
            );
    }
}