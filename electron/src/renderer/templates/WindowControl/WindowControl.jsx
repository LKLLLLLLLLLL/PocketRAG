import React from 'react';
import ReactDOM from 'react-dom';
import {Button} from 'antd';
import './WindowControl.css';
import { 
  CloseOutlined,        
  MinusOutlined,         
  BorderOutlined,        
  SwitcherOutlined       
} from '@ant-design/icons';
import { useState } from 'react';

export default function WindowControl(){
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
        <div className = 'top-button-container'>
            <Button className = 'minimize' 
                    icon = {<MinusOutlined></MinusOutlined>}
                    onClick = {()=>handleClick('minimize')}></Button>
            <Button className = 'maximize' 
                    icon = {!isMax ? <BorderOutlined></BorderOutlined> : <SwitcherOutlined></SwitcherOutlined>}
                    onClick = {()=>handleClick('maximize')}></Button>
            <Button className = 'close' 
                    icon = {<CloseOutlined></CloseOutlined>}
                    onClick = {()=>handleClick('close')}></Button>
        </div>
    )
}