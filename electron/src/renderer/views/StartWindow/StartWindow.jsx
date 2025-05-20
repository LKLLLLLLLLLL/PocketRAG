import React,{useState} from 'react';
import ReactDOM from 'react-dom';
import StartWindowContainer from '../../components/StartWindowComponents/StartWindowContainer.jsx';
export default function StartWindow(){
    return function renderStartWindow(){
        return(
            <React.StrictMode>
                <StartWindowContainer></StartWindowContainer>
            </React.StrictMode>
        )
    }
};