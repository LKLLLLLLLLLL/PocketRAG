import React,{useState} from 'react';
import ReactDOM from 'react-dom';
import './SettingsWindow.css';
import SettingsWindowContainer from '../../components/SettingsWindowComponents/SettingsWindowContainer';
export default function SettingsWindow(){
    return function renderSettingsWindow(){
        return(
            <React.StrictMode>
                <SettingsWindowContainer></SettingsWindowContainer>
            </React.StrictMode>
        )
    }
}