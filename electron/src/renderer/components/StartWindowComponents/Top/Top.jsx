import React from 'react';
import ReactDOM from 'react-dom';
import {Button} from 'antd';
import './Top.css';
export default function Top(){
    return(
        <div className = 'top-container'>
            <div className = 'top-button-container'>
                <Button className = 'minimize_0'></Button>
                <Button className = 'close_0'></Button>
            </div>
        </div>
    )
}