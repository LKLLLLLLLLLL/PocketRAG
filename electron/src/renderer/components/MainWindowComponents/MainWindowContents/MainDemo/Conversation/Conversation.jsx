import React from 'react';
import ReactDOM from 'react-dom/client';
import './Conversation.css';
import {Panel,PanelGroup,PanelResizeHandle} from 'react-resizable-panels';
export default function Conversation(){
    return(
        <div className = 'conversation-container'>
            <div className = 'conversationtabs-container'>
                对话标签栏
            </div>
            <div className = 'conversationpage-parent-container'>
                <PanelGroup direction = 'vertical'>
                    <Panel className = 'conversationpage-container' defaultSize = {70} minSize = {40}>
                        显示对话
                    </Panel>
                    <PanelResizeHandle></PanelResizeHandle>
                    <Panel className = 'input-container' defaultSize = {30} maxSize = {60}>
                        输入问题
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    )
}