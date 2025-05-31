import React, { Children } from 'react';
import ReactDOM from 'react-dom';
import './RightScreen.css'
import WindowControl from '../../../templates/WindowControl/WindowControl.jsx';
import {Button} from 'antd';
import {CloseOutlined} from '@ant-design/icons';
export default function RightScreen({content,onClick}){
    switch(content){
        case 'lidongdong':
            return(
                <RightScreenContainer onClick = {onClick}>
                    <div>李冬冬</div>
                    {console.log('Li Dongdong has been awaken.')}
                </RightScreenContainer>
            )
        case 'zhangjing':
            return(
                <RightScreenContainer onClick = {onClick}>
                    <div>张静</div>
                    {console.log('Zhang Jing has been awaken.')}
                </RightScreenContainer>
            )
        case 'guoweibin':
            return(
                <RightScreenContainer onClick = {onClick}>
                    <div>郭卫斌</div>
                    {console.log('Guo Weibin has been awaken.')}
                </RightScreenContainer>
            )
        default:
            return(
                <RightScreenContainer onClick = {onClick}>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    <div>什么也没有</div>
                    {console.log('Nobody has been awaken.')}
                </RightScreenContainer>
            )
    }
}
function RightScreenContainer({children,onClick}){
    return(
        <div className = 'rightscreen-container'>
            {/* <div style = {{display: 'flex', marginLeft: 'auto'}}>
                <WindowControl></WindowControl>
            </div> */}
            <div className = 'closebar-container'>
                <Button icon = {<CloseOutlined></CloseOutlined>} onClick = {onClick}>
                </Button>
            </div>
            <div className = 'rightscreen-main'>
                {children}
            </div>
        </div>
    )
}