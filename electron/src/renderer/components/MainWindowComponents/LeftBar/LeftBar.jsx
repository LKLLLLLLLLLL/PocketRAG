import React from 'react';
import ReactDOM from 'react-dom/client';
import './LeftBar.css';
import {Button} from 'antd';
import {SettingOutlined, SearchOutlined, MessageOutlined, PlusCircleOutlined} from '@ant-design/icons';
export default function LeftBar({handleConversation,handleSearch}){
    return(
        <div className = 'LeftBar-container'>
            <div className = 'leftbar'>
                <div className = 'leftbar-up'>
                    <Button className = 'lb-button search'
                            icon = {<SearchOutlined style = {{fontSize: 20}}></SearchOutlined>}
                            onClick = {handleSearch}>
                    </Button>
                    <Button className = 'lb-button conversation'
                            icon = {<MessageOutlined style = {{fontSize: 20}}></MessageOutlined>}
                            onClick = {handleConversation}>
                    </Button>
                    <Button className = 'lb-button new'
                            onClick = {async() => {await window.openRepoListWindow()}}
                            icon = {<PlusCircleOutlined style = {{fontSize: 20}}/>}>
                    </Button>
                </div>
                <div className = 'leftbar-down'>
                    <Button className = 'lb-button setting'
                            icon = {<SettingOutlined style = {{fontSize: 20}}></SettingOutlined>}
                            onClick = {async() => {await window.openSettingsWindow()}}>
                    </Button>
                </div>
            </div>
        </div>
    )
}