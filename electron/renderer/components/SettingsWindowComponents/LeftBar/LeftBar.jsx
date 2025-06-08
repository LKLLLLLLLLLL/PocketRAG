import React, { useState,useEffect } from 'react';
import { Button } from 'antd';
import './LeftBar.css';
import { 
    DesktopOutlined, 
    CodeOutlined, 
    SearchOutlined, 
    MessageOutlined,
    DashboardOutlined,
    SettingOutlined
} from '@ant-design/icons';

export default function LeftBar({ setContent }) {
    const [active, setActive] = useState('localModelManagement');
    const [version, setVersion] = useState('v1.0'); // 初始化版本号

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const data = await window.electronAPI.getVersion();
                setVersion(data);
            } catch (err) {
                console.error('Error fetching version:', err);
            }
        };
        fetchVersion();
    }, []);

    const handleClick = (key) => {
        setActive(key);
        setContent(key);
    };
    
    const menuItems = [
        { key: 'localModelManagement', label: '模型管理', icon: <CodeOutlined /> },
        { key: 'searchSettings', label: '检索设置', icon: <SearchOutlined /> },
        { key: 'conversationSettings', label: '对话设置', icon: <MessageOutlined /> },
        { key: 'performance', label: '性能设置', icon: <DashboardOutlined /> },
        { key: 'page', label: '页面样式', icon: <DesktopOutlined /> },
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
                        color="default"
                        variant='text'
                    >
                        <span className="button-icon">{item.icon}</span>
                        <span className="button-label">{item.label}</span>
                    </Button>
                ))}
            </div>
            <div className='leftbar-footer'>
                <div className="version-info">
                    <p>Version v{version}</p>
                    <p>© 2025 PocketRAG</p>
                </div>
            </div>
        </div>
    );
}