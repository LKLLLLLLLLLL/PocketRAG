import React from 'react';
import ReactDOM from 'react-dom';
import './Top.css';
export default function Top(){
    return(
        <div className = 'top-container'>
            <div className = 'top-button-container'>
                <button className = 'minimize'></button>
                <button className = 'close'></button>
            </div>
        </div>
    )
}