import React from 'react';
import ReactDOM from 'react-dom/client';
import './Min_Max_Close.css';
export default function Min_Max_Close(){
    return(
        <div className = 'Min_Max_Close-container'>
            <button className = 'minbutton'>小</button>
            <button className = 'maxbutton'>大</button>
            <button className = 'closebutton'>关</button>
        </div>
    )
}