import React,{useState} from 'react';
import ReactDOM from 'react-dom';
import './SettingsWindowContainer.css';
import LeftBar from './LeftBar/LeftBar';
import RightScreen from './RightScreen/RightScreen';
export default function SettingsWindowContainer(){
    const [content,setContent] = useState('');
    return(
        <div>
            <div className = 'settingswindow-container'>
                <LeftBar setContent = {setContent}></LeftBar>
                <RightScreen content = {content}></RightScreen>
            </div>
        </div>
    )
}