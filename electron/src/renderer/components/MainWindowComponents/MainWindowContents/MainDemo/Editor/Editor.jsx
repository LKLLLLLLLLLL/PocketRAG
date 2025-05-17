import React from 'react';
import ReactDOM from 'react-dom/client';
import {Panel,PanelGroup,PanelResizeHandle} from 'react-resizable-panels';
import './Editor.css';
export default function Editor(){
    return(
        <div className = 'editor-container'>
            <div className = 'editortabs-container'>
                文件标签栏
            </div>
            <div className = 'editorpage-parent-container'>
                <PanelGroup direction = 'horizontal'>
                    <Panel className = 'editorpage-container' defaultSize = {70} minSize = {40} maxSize = {80}>
                        文件编辑器
                    </Panel>
                    <PanelResizeHandle></PanelResizeHandle>
                    <Panel className = 'directory-container' defaultSize = {30} minSize = {20} maxSize = {60}>
                        文件目录
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    )
}