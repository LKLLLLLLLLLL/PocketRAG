import React from 'react';
import ReactDOM from 'react-dom/client';
import './Search.css';
export default function Search(){
    return(
        <div className = 'Search-container'>
            <div className = 'searchbar'>
                <button className = 'last'></button>
                <button className = 'next'></button>
                <button className = 'search'></button>
            </div>
        </div>
    )
}