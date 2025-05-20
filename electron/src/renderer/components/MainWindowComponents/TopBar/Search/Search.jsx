import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState,useRef,useEffect } from 'react';
import './Search.css';
import PopWindow from '../../../../templates/PopWindow/Popwindow';
import { LeftOutlined,RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

export default function Search(){
    const [open,setOpen] =useState(false);//judge whether to open search list
    const [showResult, setShowResult] = useState(false);//judge whether to show the result
    const [value,setValue] = useState(null);//record the text
    const [searchResult,setSearchResult] = useState(null);//record the result
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
            // console.log(value);
            let result = await window.search(value,true);
            // console.log(result);
            setSearchResult(result);
            handleSearch();
        }
    };

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

    return(
        <div className = 'Search-container' ref = {wrapperRef}>
            <div className = 'searchbar'>
                <Button icon = {<LeftOutlined></LeftOutlined>} className = 'last'></Button>
                <Button icon = {<RightOutlined></RightOutlined>} className = 'next'></Button>
                <div className = 'searchdiv'>
                    <Button type="primary" icon={<SearchOutlined></SearchOutlined>} iconPosition={'end'} onClick = {handleClick}>
                        搜索
                    </Button>
                    {open && (
                            <div className = 'searchlist-container'>
                                <div className = 'input00-container'>
                                    <input 
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
                <PopWindow onClose = {setShowResult}>
                    <ResultWindow result = {searchResult}></ResultWindow>
                </PopWindow>
            }
        </div>
    )
}
const ResultWindow = ({result}) =>{
    return(
        <div className = 'resultwindow-container'>
            <div className = 'another-container'>
                <input placeholder = '输入关键词 按回车确认' className = 'anotherinput' type = 'text'></input>
            </div>
            <div className = 'result-container'>
                这里是结果
                <div className = 'result-demo'>{result ? JSON.stringify(result) : '无结果'}</div>
            </div>
        </div>
    )
}