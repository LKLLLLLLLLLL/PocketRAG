import React, { useEffect, useState } from 'react';
import './About.css';
const About = ({version,onSaveAllSettings}) => {
    return(        <div className = "about-container">
            <h1>关于PocketRAG</h1>
            <div className = 'about-content'>
                <div className = "content version">
                    Version: v{version}
                </div>
                <div className = "content author">
                    Author: LKL XZR WEH
                </div>
                <div className = "content update">
                    Update: 2025-6-11
                </div>
            </div>
            
            {/* 底部空白块，防止被悬浮按钮遮挡 */}
            <div className="bottom-spacer"></div>
        </div>
    )
}
export default About;