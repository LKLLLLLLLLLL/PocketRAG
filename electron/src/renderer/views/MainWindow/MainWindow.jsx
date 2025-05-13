import React from 'react';
import ReactDOM from 'react-dom/client';
import './MainWindow.css';
import TopBar from '../../components/MainWindowComponents/TopBar/TopBar.jsx';
import MainWindowContents from '../../components/MainWindowComponents/MainWindowContents/MainWindowContents.jsx';
export default function MainWindow(){
    // 返回一个渲染函数，而不是直接渲染
    return function renderMainWindow() {
        return (
            <React.StrictMode>
                <div className = "main-window-container">
                    <TopBar></TopBar>
                    <MainWindowContents></MainWindowContents>
                </div>
            </React.StrictMode>
        );
    };
}