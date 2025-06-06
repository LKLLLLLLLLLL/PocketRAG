import React, { useState } from 'react';
import { Button } from 'antd';
import './LeftBar.css';
import { 
    FileOutlined, 
    CodeOutlined, 
    SearchOutlined, 
    MessageOutlined,
    SettingOutlined
} from '@ant-design/icons';

export default function LeftBar({ setContent }) {
    const [active, setActive] = useState('page');
    const handleClick = (key) => {
        setActive(key);
        setContent(key);
    };
    
    const menuItems = [
        { key: 'page', label: '页面', icon: <FileOutlined /> },
        { key: 'localModelManagement', label: '模型', icon: <CodeOutlined /> },
        { key: 'searchSettings', label: '搜索', icon: <SearchOutlined /> },
        { key: 'conversationSettings', label: '对话', icon: <MessageOutlined /> },
        { key: 'settings', label: '高级设置', icon: <SettingOutlined /> }
    ];
    
    return (
        <div className='leftbar-container'>
            <div className='leftbar-header'>
                <h3>设置</h3>
            </div>
            <div className='leftbar-main'>
                {menuItems.map(item => (
                    <Button 
                        key={item.key}
                        className={`set-lb-button${active === item.key ? ' selected' : ''}`}
                        onClick={() => handleClick(item.key)}
                    >
                        <span className="button-icon">{item.icon}</span>
                        <span className="button-label">{item.label}</span>
                    </Button>
                ))}
            </div>
            <div className='leftbar-footer'>
                <div className="version-info">
                    <p>Version v1.0.0</p>
                    <p>© 2025 PocketRAG</p>
                </div>
            </div>
        </div>
    );
}