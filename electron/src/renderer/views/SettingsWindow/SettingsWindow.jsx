import React,{useState} from 'react';
import ReactDOM from 'react-dom';
import './SettingsWindow.css';
import SettingsWindowContainer from '../../components/SettingsWindowComponents/SettingsWindowContainer';
import TopBar from '../../templates/TopBar/TopBar';
export default function SettingsWindow(){
    return function renderSettingsWindow(){
        return(
            <React.StrictMode>
                <div style ={{  height: '100vh',
                                width: '100vw',
                                display: 'flex',
                                overflow: 'hidden', 
                                flexDirection:'column'}}>
                    {/* <TopBar></TopBar> */}
                    <SettingsWindowContainer></SettingsWindowContainer>
                </div>
            </React.StrictMode>
        )
    }
}