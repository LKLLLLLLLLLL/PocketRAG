import React from 'react';
import ReactDOM from 'react-dom/client';
import './LeftBar.css';
import {Button} from 'antd';
export default function LeftBar(){
    return(
        <div className = 'LeftBar-container'>
            <div className = 'leftbar'>
                <Button className = 'lb-button1'>1</Button>
                <Button className = 'lb-button2'>2</Button>
                <Button className = 'lb-button3'>3</Button>
            </div>
        </div>
    )
}