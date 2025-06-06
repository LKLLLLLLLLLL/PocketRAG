import React from 'react';
import ReactDOM from 'react-dom';
import './PocketRAG.css';
export default function PocketRAG(){
    return(
        <div className = 'pocketrag-container'>
            <div className = 'icon-container'>
            </div>
            <div className = 'version-container'>
                <div style={{fontSize:'20px'}}>PocketRAG</div>
                <span style = {{fontSize: '12px',color:'darkgrey'}}><p>Version: v1.0</p></span>
            </div>
        </div>
    )
}