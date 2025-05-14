import React,{useState} from 'react';
import ReactDOM from 'react-dom';
import './LeftBar.css';
export default function LeftBar({setContent}){
    return(
        <div className = 'leftbar-container'>
            <button onClick = {()=>setContent('lidongdong')}>
                李冬冬
            </button>
            <button onClick = {()=>setContent('zhangjing')}>
                张静
            </button>
            <button onClick = {()=>setContent('guoweibin')}>
                郭卫斌
            </button>
        </div>
    )
}