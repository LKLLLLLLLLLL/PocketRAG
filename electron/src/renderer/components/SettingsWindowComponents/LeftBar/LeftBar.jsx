import React,{useState} from 'react';
import ReactDOM from 'react-dom';
import {Button} from 'antd';
import './LeftBar.css';
export default function LeftBar({setContent}){
    return(
        <div className = 'leftbar-container'>
            <div className = 'leftbar-main'>
                <Button className = 'set-lb-button'
                        onClick = {()=>setContent('page')}>
                    页面
                </Button>
                <Button className = 'set-lb-button'
                        onClick = {()=>setContent('localModelManagement')}>
                    模型
                </Button>
                <Button className = 'set-lb-button'
                        onClick = {()=>setContent('searchSettings')}>
                    搜索
                </Button>
                <Button className = 'set-lb-button'
                        onClick = {()=>setContent('conversationSettings')}>
                    对话
                </Button>
            </div>
        </div>
    )
}