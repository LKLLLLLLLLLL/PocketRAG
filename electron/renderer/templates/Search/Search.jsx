import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState,useRef,useEffect } from 'react';
import './Search.css';
import PopWindow from '../PopWindow/Popwindow';
import { LeftOutlined,RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

export default function Search(){
    const [open,setOpen] =useState(false);//judge whether to open search list
    const [showResult, setShowResult] = useState(false);//judge whether to show the result or not
    const [value,setValue] = useState('');//record the text
    const [searchResult,setSearchResult] = useState([]);//record the result
    const [selectedResultIndex, setSelectedResultIndex] = useState(null);//record the selected result
    const [lastClickTime,setLastClickTime] = useState(0);//record the last click time
    const [loading,setLoading] = useState(false);//record the loading state
    const [timeout,setTimeOut] = useState(false);//record the timeout state
    const wrapperRef = useRef(null);

    //click the search button to open search div
    const handleClick = () =>{
        setOpen(!open);
    }

    //click outside to close the search div
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    //press enter to search
    const handleKeyPress = async (e) => {
        if (e.key === 'Enter') {
            setShowResult(true);
            setLoading(true);
            // console.log(value);
            try{
                let result = await window.search(value,true);
                // console.log(result);
                setSearchResult(result);
            }
            catch(error){
                if(error && error.message && error.message.includes('timeout') ){
                    setTimeOut(true);
                }
            }
            finally{
                setOpen(false);
                setLoading(false);
            }
        }
    };

    //click the result item to open the file
    // const handleResultClick = (result) => {
    //     const now = Date.now();
    //     if (now - lastClickTime < 300) {
    //         window.openRepo(repo.name);
    //         setSelectedResult(null);
    //         return;
    //     }
    //     setLastClickTime(now);
    //     setSelectedResult(prev => 
    //     prev?.path === repo.path ? null : repo
    //     );
    // };

    //receive the text from the input
    const handleOnChange = (event) =>{
        setValue(event.target.value);
        // console.log(value);
    }

    const resultItem = searchResult.map((item,index) => {
        return(
            <li key = {index}
                className = {`result-item ${selectedResultIndex === index ? 'selected' : ''}`}
                onClick = {()=>setSelectedResultIndex(index)}>
                    <div className = 'result-item-container'>
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

    return(
        <div className = 'Search-container' ref = {wrapperRef}>
            <div className = 'searchbar'>
                <Button icon = {<LeftOutlined></LeftOutlined>} className = 'last'></Button>
                <Button icon = {<RightOutlined></RightOutlined>} className = 'next'></Button>
                <div className = 'searchdiv'>
                    <Button type="primary" 
                            icon={<SearchOutlined></SearchOutlined>} 
                            iconPosition={'end'} 
                            onClick = {handleClick}
                            className = 'searchbutton'>
                        搜索
                    </Button>
                    {open && (
                            <div className = 'searchlist-container'>
                                <div className = 'input00-container'>
                                    <input
                                        value = {value} 
                                        placeholder = '输入关键词 按回车确认' 
                                        className = 'input00' 
                                        type = 'text' 
                                        onKeyDown = {handleKeyPress} 
                                        onChange = {handleOnChange}>
                                    </input>
                                </div>
                                <div className = 'suggestions-container'>
                                    这里是建议
                                </div>
                                <div className = 'filehistory-container'>
                                    这里是文件打开历史
                                </div>
                            </div>
                        )
                    }
                </div>
            </div>
            {/* {console.log(searchResult)} */}
            {showResult &&
                <PopWindow onClose = {()=>setShowResult(false)}>
                    <ResultWindow resultItem = {resultItem} loading = {loading} timeout = {timeout}></ResultWindow>
                </PopWindow>
            }
        </div>
    )
}
const ResultWindow = ({resultItem,loading,timeout}) =>{
    return(
        <div className = 'resultwindow-container'>
            <div className = 'another-container'>
                <input placeholder = '输入关键词 按回车确认' className = 'anotherinput' type = 'text'></input>
            </div>
            <div className = 'result-container'>
                <div className = 'explanation-container'>
                    {loading && <div>Loading…</div>}
                    {timeout && <div>请求超时</div>}
                    {(!loading) && <div>搜索结果</div>}
                </div>
                <div className = 'result-demo'>
                    {!loading && 
                        <ul className = 'result-list-container'>
                            {resultItem}
                        </ul>}
                </div>
            </div>
        </div>
    )
}