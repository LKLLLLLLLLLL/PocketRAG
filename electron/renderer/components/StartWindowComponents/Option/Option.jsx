import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import './Option.css';
import {Button} from 'antd';
import PopWindow from '../../../templates/PopWindow/Popwindow';
const Option =({others,setOthers})=>{

    //awake the create-window
    const handleClick_new = async ()=>{
        await window.createRepo();
    }

    return(
        <div className = 'option-container'>
            <div className = 'new-container'>
                <span className = 'new-description'>
                    <div style = {{fontWeight: 'bond', fontSize: '16px'}}>
                        导入仓库
                    </div>
                    <div style ={{fontSize: '12px',color: 'darkgrey'}}>
                        选择一个文件夹作为仓库。
                    </div>
                </span>
                <span>
                    <Button className = 'new-button' 
                            onClick = {handleClick_new}
                            color = 'cyan'
                            variant = "primary">
                        导入仓库
                    </Button>
                </span>
            </div>
            <div className = 'other-container'>
                <span className = 'other-description'>
                    <div style = {{fontWeight: 'bond', fontSize: '16px'}}>
                        设置
                    </div>
                    <div style ={{fontSize: '12px',color: 'darkgrey'}}>
                        打开设置页面。
                    </div>
                </span>
                <span>
                    <Button className = 'other-button' 
                            onClick = {() => window.openSettingsWindow()}
                            color = 'cyan'
                            variant = "primary">
                        设置
                    </Button>
                </span>
            </div>
            {others &&
                <PopWindow onClose = {()=>setOthers(false)}>
                    <OtherOptionsWindow></OtherOptionsWindow>
                </PopWindow>
            }
        </div>
    )
}
export default Option;
const OtherOptionsWindow =()=>{
    return(
        <div className = 'oow-container'>
            <div>其他选项</div>
        </div>
    )
}