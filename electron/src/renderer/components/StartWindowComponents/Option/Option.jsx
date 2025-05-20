import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import './Option.css';
import {Button} from 'antd';
import PopWindow from '../../../templates/PopWindow/Popwindow';
const Option =({setDemo,others,setOthers,receiveRepolist})=>{

    //awake the create-window
    const handleClick_new =()=>{
        window.createRepo();
    }
    
    const handleClick_open =()=>{
        setDemo(true);
        receiveRepolist();
    }

    return(
        <div className = 'option-container'>
            <div className = 'new-container'>
                <span className = 'new-description'>
                    <div>
                        新建
                    </div>
                    <div>
                        点击右侧“新建仓库”按钮，选择文件夹并建立仓库。
                    </div>
                </span>
                <span>
                    <Button className = 'new-button' onClick = {handleClick_new}>
                        新建仓库
                    </Button>
                </span>
            </div>
            <div className = 'open-container'>
                <span className = 'open-description'>
                    <div>
                        打开
                    </div>
                    <div>
                        点击右侧“打开仓库”按钮，在左侧面板中显示已有仓库，通过“双击”或“单击+回车”打开仓库。
                    </div>
                </span>
                <span>
                    <Button className = 'open-button' onClick = {handleClick_open}>
                        打开仓库
                    </Button>
                </span>
            </div>
            <div className = 'other-container'>
                <span className = 'other-description'>
                    <div>
                        其他
                    </div>
                    <div>
                        点击右侧“其他选项”按钮，展开其他选项。
                    </div>
                </span>
                <span>
                    <Button className = 'other-button' onClick = {()=>setOthers(true)}>
                        其他选项
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