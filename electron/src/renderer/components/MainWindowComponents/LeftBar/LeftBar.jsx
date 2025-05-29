import React from 'react';
import ReactDOM from 'react-dom/client';
import './LeftBar.css';
import {Button} from 'antd';
import {SettingOutlined, SearchOutlined, MessageOutlined} from '@ant-design/icons';
export default function LeftBar({handleConversation,handleSearch}){
    return(
        <div className = 'LeftBar-container'>
            <div className = 'leftbar'>
                <Button className = 'lb-button'
                        icon = {<SearchOutlined className = 'lb-button-icon'></SearchOutlined>}
                        onClick = {handleSearch}>
                </Button>
                <Button className = 'lb-button'
                        icon = {<MessageOutlined className = 'lb-button-icon'></MessageOutlined>}
                        onClick = {handleConversation}>
                </Button>
                <Button className = 'lb-button'
                        icon = {<SettingOutlined></SettingOutlined>}
                        onClick = {async() => {await window.openSettingsWindow()}}>
                </Button>
                <Button className = 'lb-button'
                        onClick = {async() => {await window.openRepoListWindow()}}>
                            新窗口
                </Button>
            </div>
        </div>
    )
}