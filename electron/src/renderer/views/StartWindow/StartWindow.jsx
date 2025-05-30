import React,{useState} from 'react';
import ReactDOM from 'react-dom';
import TopBar from '../../templates/TopBar/TopBar.jsx';
import StartWindowContainer from '../../components/StartWindowComponents/StartWindowContainer.jsx';
export default function StartWindow(){
    return function renderStartWindow(){
        return(
            <React.StrictMode>
                <div style ={{  height: '100vh',
                                width: '100vw',
                                display: 'flex',
                                overflow: 'hidden', 
                                flexDirection:'column'}}>
                    {/* <TopBar></TopBar> */}
                    <StartWindowContainer></StartWindowContainer>
                </div>
            </React.StrictMode>
        )
    }
};