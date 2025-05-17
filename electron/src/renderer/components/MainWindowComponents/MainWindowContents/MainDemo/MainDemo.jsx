import React from 'react';
import ReactDOM from 'react-dom/client';
import {Panel,PanelGroup,PanelResizeHandle} from 'react-resizable-panels';
import Editor from './Editor/Editor.jsx';
import Conversation from './Conversation/Conversation.jsx';
import './MainDemo.css';
export default function MainDemo(){
    return(
        <div className = 'MainDemo-container'>
            <PanelGroup direction = 'horizontal'>
                <Panel defaultSize = {65} minSize = {35} maxSize = {90} >
                    <Editor></Editor>
                </Panel>
                <PanelResizeHandle></PanelResizeHandle>
                <Panel defaultSize = {35} minsize = {10} maxSize = {65}>
                    <Conversation></Conversation>
                </Panel>
            </PanelGroup>
        </div>
    )
}