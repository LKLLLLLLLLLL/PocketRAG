import React from 'react';
import ReactDOM from 'react-dom/client';
import {Button} from 'antd';
import './Min_Max_Close.css';
export default function Min_Max_Close(){
    return(
        <div className = 'Min_Max_Close-container'>
            <Button className = 'minbutton'>小</Button>
            <Button className = 'maxbutton'>大</Button>
            <Button className = 'closebutton'>关</Button>
        </div>
    )
}