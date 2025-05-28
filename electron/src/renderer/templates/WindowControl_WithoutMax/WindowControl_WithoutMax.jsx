import React from 'react';
import ReactDOM from 'react-dom';
import {Button} from 'antd';
import './WindowControl_WithoutMax.css';
import { 
  CloseOutlined,        
  MinusOutlined,            
} from '@ant-design/icons';
import { useState } from 'react';

export default function WindowControl_WithoutMax(){
    const [isMax,setIsMax] =useState(false);//judge whether the window is maximized or not
    const handleClick =(type)=>{
        switch(type){
            case 'minimize':
                window.electronAPI.minimize();
                break;
            case 'maximize':
                window.electronAPI.maximize();
                setIsMax(!isMax);
                break;
            case 'close':
                window.electronAPI.close();
                break;
            default:
                break;
        }
    }
    return(
        <div className = 'top-button-container_0'>
            <Button className = 'minimize_0' 
                    icon = {<MinusOutlined></MinusOutlined>}
                    onClick = {()=>handleClick('minimize')}></Button>
            <Button className = 'close_0' 
                    icon = {<CloseOutlined></CloseOutlined>}
                    onClick = {()=>handleClick('close')}></Button>
        </div>
    )
}