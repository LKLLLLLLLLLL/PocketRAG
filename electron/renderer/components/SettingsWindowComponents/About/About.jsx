import React, { useEffect, useState } from 'react';
import './About.css';

const About = ({version, onSaveAllSettings}) => {
    // 定义一个函数来打开链接
    const handleOpenLink = () => {
        window.open('https://github.com/LKLLLLLLLLLL/PocketRAG', '_blank', 'noopener,noreferrer');
    };

    return(        
        <div style={{display: 'flex', height: '100%', width: '100%', flexDirection: 'column'}}>
            <div className="about-container">
                <h1>关于PocketRAG</h1>
                <div className='about-content'>
                    <div className="content version">
                        Version: v{version}
                    </div>
                </div>
            </div>
            <div className="link-container" style={{display:'flex', justifyContent: 'center', alignItems: 'center', color:"darkgrey"}}>
                {/* 使用div和事件来替代a标签 */}
                <div onClick={handleOpenLink} style={{cursor: 'pointer', cursor: 'hand', color: 'darkgrey'}}>
                    更多信息点此处访问
                </div>
            </div>
        </div>
    )
}

export default About;