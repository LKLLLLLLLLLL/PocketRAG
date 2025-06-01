import {useState} from 'react';
import './SettingsWindowContainer.css';
import LeftBar from './LeftBar/LeftBar';
import RightScreen from './RightScreen/RightScreen';
export default function SettingsWindowContainer(){
    const [content,setContent] = useState('');
    return(
        <div className='settingswindow-container'>
            <div className='settingswindow-main'>
                <LeftBar setContent={setContent}></LeftBar>
                <RightScreen content={content} onClick = {async ()=>{ await window.electronAPI.close()}}></RightScreen>
            </div>
        </div>
    )
}