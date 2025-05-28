import React from 'react';
import './Topbar.css';
import { children } from 'react';
const TopBar =({children})=> {
    return(
        <div className = 'topbar-container'>
            {children}
        </div>
    )
}
export default TopBar;