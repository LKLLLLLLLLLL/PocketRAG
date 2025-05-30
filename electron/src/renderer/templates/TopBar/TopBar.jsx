import React from 'react';
import './TopBar.css';
const TopBar =({children})=> {
    return(
        <div className = 'topbar-container'>
            {children}
        </div>
    )
}
export default TopBar;