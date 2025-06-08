import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './PocketRAG.css';
import logoPath from '../../../../public/icon.png';

export default function PocketRAG() {
    const [version, setVersion] = useState('v1.0'); // 初始化版本号

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const data = await window. electronAPI.getVersion();
                setVersion(data);
            } catch (err) {
                console.error('Error fetching version:', err);
            }
        };
        fetchVersion();
    }, []);

    return (
        <div className='pocketrag-container'>
            <div className='icon-container'>
                <img src={logoPath} alt="PocketRAG Logo" width="160px" />
            </div>
            <div className='version-container'>
                <div style={{ fontSize: '20px' }}>PocketRAG</div>
                <span style={{ fontSize: '12px', color: 'darkgrey' }}>
                    <p>Version v{version || 'v1.0'}</p> {/* 如果 version 为空，显示默认值 */}
                </span>
            </div>
        </div>
    );
}