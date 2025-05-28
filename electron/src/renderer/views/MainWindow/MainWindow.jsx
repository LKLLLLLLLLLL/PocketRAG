import React from 'react';
import ReactDOM from 'react-dom/client';
import './MainWindow.css';
import MainWindowContents from '../../components/MainWindowComponents/MainWindowContents.jsx';
import TopBar from '../../templates/TopBar/TopBar.jsx';
import TopTools from '../../templates/TopTools/TopTools.jsx';
import Search from '../../templates/Search/Search.jsx';
import WindowControl from '../../templates/WindowControl/WindowControl.jsx';
export default function MainWindow(){
    // 返回一个渲染函数，而不是直接渲染
    return function renderMainWindow() {
        return (
            <React.StrictMode>
                <div className = "main-window-container">
                    <TopBar>
                        <TopTools></TopTools>
                        {/* <Search></Search> */}
                        <div style ={{display: 'flex',marginLeft: 'auto'}}>
                            <WindowControl></WindowControl>
                        </div>
                    </TopBar>
                    <MainWindowContents></MainWindowContents>
                </div>
            </React.StrictMode>
        );
    };
}