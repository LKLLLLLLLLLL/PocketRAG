import React from 'react';
import ReactDOM from 'react-dom/client';
import './TopBar.css';
import TopTools from './TopTools/TopTools.jsx';
import Search from './Search/Search.jsx';
import Min_Max_Close from './Min_Max_Close/Min_Max_Close.jsx';
export default function TopBar(){
    return(
        <div className = 'TopBar-container'>
            <TopTools></TopTools>
            <Search></Search>
            <Min_Max_Close></Min_Max_Close>
        </div>
    )
}