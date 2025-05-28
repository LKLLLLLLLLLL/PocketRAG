import React,{useState} from 'react';
import ReactDOM from 'react-dom/client';
import {Button} from 'antd';
import './TopTools.css';
export default function TopTools(){
    const [flag,setFlag] = useState('');

    const handleClick =(value)=>{
        setFlag(value);
    }
    return(
        <div className = 'TopTools-container'>
            <Button className = 'button01'>01</Button>
            <Button className = 'button02'>02</Button>
            <Button className = 'button03'>03</Button>
            <Button className = 'button04'>04</Button>
        </div>
    )
}