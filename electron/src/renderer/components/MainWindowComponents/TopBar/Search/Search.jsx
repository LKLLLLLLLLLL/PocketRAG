//react
import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState,useRef,useEffect } from 'react';

//css
import './Search.css';

//child-components
import PopWindow from '../../../../templates/PopWindow/Popwindow';

//antd
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
            console.log(value);
            let result = await window.search(value,true);
            console.log(result);
            setSearchResult(result);
            handleSearch();
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

    //disable the search div and trigger the result window
    const handleSearch = () => {
        setOpen(false);
        setShowResult(true);
    };

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
                    <div className = 'result-container'>
                        <div className = 'chunkcontent-container'>
                            {item.content}
                        </div>
                        <div className = 'metadata-container'>
                            {item.metadata}
                        </div>
                        <div className = 'position-container'>
                            {item.beginLine}
                            {item.endLine}
                        </div>
                        <div className = 'filepath-container'>
                            {item.filePath}
                        </div>
                        <div className = 'score-container'>
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
                    <ResultWindow resultItem = {resultItem}></ResultWindow>
                </PopWindow>
            }
        </div>
    )
}
const ResultWindow = ({resultItem}) =>{
    return(
        <div className = 'resultwindow-container'>
            <div className = 'another-container'>
                <input placeholder = '输入关键词 按回车确认' className = 'anotherinput' type = 'text'></input>
            </div>
            <div className = 'result-container'>
                <div className = 'explanation-container'>
                    这里是结果
                </div>
                <div className = 'result-demo'>
                    <ul className = 'result-list-container'>
                        {resultItem}
                    </ul>
                </div>
            </div>
        </div>
    )
}