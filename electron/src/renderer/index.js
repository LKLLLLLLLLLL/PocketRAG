import React from 'react';
import ReactDOM from 'react-dom/client';
import MainWindow from './views/MainWindow/MainWindow';

// 获取当前窗口类型
// const urlParams = new URLSearchParams(window.location.search);
// const windowType = urlParams.get('windowType') || 'main';
const windowType = 'main';

// 根据窗口类型选择不同的组件
const getWindowRenderFunc = () => {
    switch (windowType) {
        case 'main':
        default:
            return MainWindow();
    }
};

const renderWindow = getWindowRenderFunc();

// 渲染窗口
ReactDOM.createRoot(document.getElementById('root')).render(
    renderWindow()
);