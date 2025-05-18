import React from 'react';
import ReactDOM from 'react-dom/client';
import './LeftBar.css';
export default function LeftBar(){
    return(
        <div className = 'LeftBar-container'>
            <div className = 'leftbar'>
                <button className = 'button1'>1</button>
                <button className = 'button2'>2</button>
                <button className = 'button3'>3</button>
            </div>
        </div>
    )
}