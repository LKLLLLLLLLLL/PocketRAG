import React from 'react';
import ReactDOM from 'react-dom';
import './Option.css';
export default function Option(){
    return(
        <div className = 'option-container'>
            <div className = 'new-container'>
                <span className = 'new-description'>
                    <div>
                        新建
                    </div>
                    <div>
                        新建的描述
                    </div>
                </span>
                <span>
                    <button className = 'new-button'>
                        我
                    </button>
                </span>
            </div>
            <div className = 'open-container'>
                <span className = 'open-description'>
                    <div>
                        打开
                    </div>
                    <div>
                        打开的描述
                    </div>
                </span>
                <span>
                    <button className = 'open-button'>
                        你
                    </button>
                </span>
            </div>
            <div className = 'other-container'>
                <span className = 'other-description'>
                    <div>
                        其他
                    </div>
                    <div>
                        其他的描述
                    </div>
                </span>
                <span>
                    <button className = 'other-button'>
                        爹
                    </button>
                </span>
            </div>
        </div>
    )
}