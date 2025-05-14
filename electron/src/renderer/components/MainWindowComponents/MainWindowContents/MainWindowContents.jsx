import React,{useRef,useState} from 'react';
import ReactDOM from 'react-dom/client';
import MainDemo from './MainDemo/MainDemo.jsx';
import Doclist from './Doclist/Doclist.jsx';
import LeftBar from './LeftBar/LeftBar.jsx';
import {Panel,PanelGroup,PanelResizeHandle} from 'react-resizable-panels';
import './MainWindowContents.css';
export default function MainWindowContents(){
    return(
        <div className = 'main-window-contents'>
            <LeftBar></LeftBar>
            <PanelGroup className = 'panelgroup' direction = 'horizontal'>
                <Panel className = 'doclist-panel' defaultsize = {30} minSize = {20} maxSize = {40}>
                    <Doclist></Doclist>
                </Panel>
                <PanelResizeHandle className = 'seperator'></PanelResizeHandle>
                <Panel className = 'maindemo-panel' defaultsize = {70} minSize = {60} maxSize = {80}>
                    <MainDemo></MainDemo>
                </Panel>
            </PanelGroup>
        </div>
    )
}