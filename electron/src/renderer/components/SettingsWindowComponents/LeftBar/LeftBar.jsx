import React, { useState } from 'react';
import { Button } from 'antd';
import './LeftBar.css';

export default function LeftBar({ setContent }) {
    const [active, setActive] = useState('page');
    const handleClick = (key) => {
        setActive(key);
        setContent(key);
    };
    return (
        <div className='leftbar-container'>
            <div className='leftbar-main'>
                <Button className={`set-lb-button${active === 'page' ? ' selected' : ''}`}
                        onClick={() => handleClick('page')}>
                    页面
                </Button>
                <Button className={`set-lb-button${active === 'localModelManagement' ? ' selected' : ''}`}
                        onClick={() => handleClick('localModelManagement')}>
                    模型
                </Button>
                <Button className={`set-lb-button${active === 'searchSettings' ? ' selected' : ''}`}
                        onClick={() => handleClick('searchSettings')}>
                    搜索
                </Button>
                <Button className={`set-lb-button${active === 'conversationSettings' ? ' selected' : ''}`}
                        onClick={() => handleClick('conversationSettings')}>
                    对话
                </Button>
            </div>
        </div>
    );
}