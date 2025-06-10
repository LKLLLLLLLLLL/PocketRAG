import React from 'react';
import './MainWindow.css';
import MainWindowContents from '../../components/MainWindowComponents/MainWindowContents.jsx';
import TopBar from '../../templates/TopBar/TopBar.jsx';
import TopTools from '../../templates/TopTools/TopTools.jsx';
import WindowControl from '../../templates/WindowControl/WindowControl.jsx';
import { StyleProvider } from '@ant-design/cssinjs'
import { ConfigProvider } from 'antd'


const AppWrapper = ({ children }) => (
    <StyleProvider>
        <ConfigProvider theme={{ cssVar: true, hashed: false }}>
            {children}
        </ConfigProvider>
    </StyleProvider>
  );

export default function MainWindow(){
    // 返回一个渲染函数，而不是直接渲染
    return function renderMainWindow() {
        return (
            <AppWrapper>
            {/* <React.StrictMode> */}
                <div className = "main-window-container">
                    {/* <TopBar style = {{display: 'flex'}}>
                        <TopTools></TopTools> 
                        <div style ={{display: 'flex',marginLeft: 'auto'}}>
                            <WindowControl></WindowControl>
                        </div>
                    </TopBar> */}
                    <MainWindowContents></MainWindowContents>
                </div>
            {/* </React.StrictMode> */}
            </AppWrapper>
        );
    };
}