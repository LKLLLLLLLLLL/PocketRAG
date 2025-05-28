import React, { Children } from 'react';
import ReactDOM from 'react-dom';
import './RightScreen.css'
import WindowControl from '../../../templates/WindowControl/WindowControl.jsx';
export default function RightScreen({content}){
    switch(content){
        case 'lidongdong':
            return(
                <RightScreenContainer>
                    <div>李冬冬</div>
                    {console.log('Li Dongdong has been awaken.')}
                </RightScreenContainer>
            )
        case 'zhangjing':
            return(
                <RightScreenContainer>
                    <div>张静</div>
                    {console.log('Zhang Jing has been awaken.')}
                </RightScreenContainer>
            )
        case 'guoweibin':
            return(
                <RightScreenContainer>
                    <div>郭卫斌</div>
                    {console.log('Guo Weibin has been awaken.')}
                </RightScreenContainer>
            )
        default:
            return(
                <RightScreenContainer>
                    <div>什么也没有</div>
                    {console.log('Nobody has been awaken.')}
                </RightScreenContainer>
            )
    }
}
function RightScreenContainer({children}){
    return(
        <div className = 'rightscreen-container'>
            <div style = {{display: 'flex', marginLeft: 'auto'}}>
                <WindowControl></WindowControl>
            </div>
            {children}
        </div>
    )
}