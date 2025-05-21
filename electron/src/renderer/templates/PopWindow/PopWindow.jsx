import React, { useState } from 'react';
import './PopWindow.css';

const PopWindow = ({ children, onClose }) => {
    const [windowState, setWindowState] = useState('normal'); // normal | max | min

    const handleWindowControl = (action) => {
        switch(action) {
            case 'max':
                setWindowState(prev => prev === 'max' ? 'normal' : 'max');
                break;
            case 'min':
                setWindowState('min');
                break;
            default:
                setWindowState('normal');
        }
    };

    return (
        <div className={`modal-overlay ${windowState === 'max' ? 'maximized' : ''}`}>
            <div className={`modal-window ${windowState}`}>
                <div className="modal-header">
                    <button 
                        className="control-button minimize" 
                        onClick={() => handleWindowControl('min')}
                        title="最小化"
                    >
                        &minus;
                    </button>
                    <button
                        className="control-button maximize"
                        onClick={() => handleWindowControl('max')}
                        title={windowState === 'max' ? '还原' : '最大化'}
                    >
                        {windowState === 'max' ? '🗗' : '□'}
                    </button>
                    <button
                        className="control-button close"
                        onClick={onClose}
                        title="关闭"
                    >
                        &times;
                    </button>
                </div>
                <div className="modal-content">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default PopWindow;