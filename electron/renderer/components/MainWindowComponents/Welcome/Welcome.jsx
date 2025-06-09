import React from 'react';
import './Welcome.css';
import logoPath from '../../../../public/icon.png';
import { useEffect, useState } from 'react';
const Welcome = ({className}) => {
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

    return(
        <div className={className}>
            <div className='maindemo-content' style = {{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%',color: 'darkgrey'}}>
                {/* <img src={logoPath} alt="PocketRAG Logo" width="160px" /> */}
                <div style ={{fontSize: '30px'}}>
                    <p>Welcome to use PocketRAG</p>
                </div>
                <div>
                    <p>version: v{version}</p>
                </div>
            </div>
        </div>
    )
}
export default Welcome;