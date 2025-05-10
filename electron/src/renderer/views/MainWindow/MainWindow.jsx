import React from 'react';
import ReactDOM from 'react-dom/client';
import SearchBar from '@/compoents/SearchBar/SearchBar';
import './MainWindow.css';

function MainWindow(){
    // 返回一个渲染函数，而不是直接渲染
    return function renderMainWindow() {
        return (
            <React.StrictMode>
                <div className="main-window">
                    <h1>PocketRAG</h1>
                    <SearchBar />
                </div>
            </React.StrictMode>
        );
    };
}

export default MainWindow;