import React from 'react';
import ReactDOM from 'react-dom';
import {Panel,PanelGroup,PanelResizeHandle} from 'react-resizable-panels';
import './StartWindow.css';
import Top from '../../components/StartWindowComponents/Top/Top.jsx';
import PocketRAG from '../../components/StartWindowComponents/PocketRAG/PocketRAG';
import Option from '../../components/StartWindowComponents/Option/Option.jsx';
export default function StartWindow(){
    return function renderStartWindow(){
        return(
            <React.StrictMode>
                <PanelGroup direction = "horizontal" className = 'startwindow-container'>
                    <Panel defaultSize = {33} minSize = {20} maxSize = {60} className = 'sw-left'>
                        < div>左侧面板</div>
                    </Panel>
                    <PanelResizeHandle className="sw-resize"></PanelResizeHandle>
                    <Panel defaultSize = {67} className = 'sw-right'>
                        <Top></Top>
                        <PocketRAG></PocketRAG>
                        <Option></Option>
                    </Panel>
                </PanelGroup>
            </React.StrictMode>
        )
    }
};