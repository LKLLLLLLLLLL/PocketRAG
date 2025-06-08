import React from 'react';
import ReactDOM from 'react-dom/client';
import './LeftBar.css';
import {Button} from 'antd';
import {SettingOutlined, SearchOutlined, MessageOutlined, PlusCircleOutlined, EditOutlined,DatabaseOutlined} from '@ant-design/icons';
export default function LeftBar({handleConversation,handleSearch,handleEdit,handleChunkInfo}){
    return(
        <div className = 'LeftBar-container'>
            <div className = 'empty-space'></div>
            <div className = 'leftbar'>
                <div className = 'leftbar-up'>
                    <Button className = 'lb-button search'
                            icon = {<SearchOutlined style = {{fontSize: 20,color: 'white'}}></SearchOutlined>}
                            onClick = {handleSearch}
                            color = "default"
                            variant = 'text'>
                    </Button>
                    <Button className = 'lb-button conversation'
                            icon = {<MessageOutlined style = {{fontSize: 20,color: 'white'}}></MessageOutlined>}
                            onClick = {handleConversation}
                            color = "default"
                            variant = 'text'>
                    </Button>
                    <Button className = 'lb-button new'
                            onClick = {async() => {await window.openRepoListWindow()}}
                            icon = {<PlusCircleOutlined style = {{fontSize: 20,color: 'white'}}/>}
                            color = "default"
                            variant = 'text'>
                    </Button>
                    {/* <Button className = 'lb-button edit'
                            onClick = {handleEdit}
                            icon = {<EditOutlined style = {{fontSize: 20,color: 'white'}}/>}
                            color = "default"
                            variant = 'text'>
                    </Button> */}
                    <Button className='lb-button chunkinfo'
                            onClick={handleChunkInfo}
                            icon={<DatabaseOutlined style={{ fontSize: 20, color: 'white' }} />}
                            color="default"
                            variant='text'>
                    </Button>
                </div>
                <div className = 'leftbar-down'>
                    <Button className = 'lb-button setting'
                            icon = {<SettingOutlined style = {{fontSize: 20,color: 'white'}}></SettingOutlined>}
                            onClick = {async() => {await window.openSettingsWindow()}}
                            color = "default"
                            variant = 'text'>
                    </Button>
                </div>
            </div>
        </div>
    )
}