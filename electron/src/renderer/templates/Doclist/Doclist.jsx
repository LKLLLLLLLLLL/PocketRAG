import React from 'react';
import ReactDOM from 'react-dom/client';
import './Doclist.css';
export default function Doclist({children}){
    return(
        <div className = 'Doclist-container'>
            <div className = 'doclist_top-container'>
                <span>
                    项目↓
                </span>
                <span style = {{float: 'right'}}>
                    打开
                </span>
            </div>
            <div className = 'doclist_main-container'>
                <div>
                    文件列表
                </div>
                {children}
            </div>
            <div className = 'doclist_tools-container'>
                <div>
                    文件工具栏
                </div>
            </div>
        </div>
    )
}