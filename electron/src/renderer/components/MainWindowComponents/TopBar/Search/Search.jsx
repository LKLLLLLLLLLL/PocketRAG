import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState,useRef,useEffect } from 'react';
import './Search.css';
import PopWindow from '../../../../templates/PopWindow/Popwindow';
export default function Search(){
    const [open,setOpen] =useState(false);
    const [showResult, setShowResult] = useState(false);
    const [value,setValue] = useState(null);
    const [searchResult,setSearchResult] = useState('default');
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
            handleSearch();
            setSearchResult(await window.search(value,true));
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
    }

    return(
        <div className = 'Search-container' ref = {wrapperRef}>
            <div className = 'searchbar'>
                <button className = 'last'>左</button>
                <button className = 'next'>右</button>
                <div className = 'searchdiv'>
                    <button className = 'searchbutton' onClick = {handleClick}>搜索</button>
                    {open && (
                            <div className = 'searchlist-container'>
                                <div className = 'input00-container'>
                                    <input 
                                        placeholder = '输入关键词 按回车确认' 
                                        className = 'input00' 
                                        type = 'text' 
                                        onKeyUp = {handleKeyPress} 
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
            {console.log(window.search.toString())}
            {console.log(searchResult)}
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
                <div className = 'result-demo'>{result}</div>
            </div>
        </div>
    )
}