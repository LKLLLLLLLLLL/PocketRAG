import React,{useState} from 'react';
import ReactDOM from 'react-dom/client';
import './TopTools.css';
export default function TopTools(){
    const [flag,setFlag] = useState('');

    const handleClick =(value)=>{
        setFlag(value);
    }
    return(
        <div className = 'TopTools-container'>
            <button className = 'button01'>01</button>
            <button className = 'button02'>02</button>
            <button className = 'button03'>03</button>
            <button className = 'button04'>04</button>
        </div>
    )
}