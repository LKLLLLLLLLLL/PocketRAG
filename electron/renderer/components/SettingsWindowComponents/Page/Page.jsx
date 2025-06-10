import React, { useState, useEffect } from 'react';
import './Page.css';
const Page = (onSaveAllSettings) => {
    return (
        <div className="page-settings-container">
            <h2>页面设置</h2>
            <p>这里可以配置页面相关的选项。</p>
        </div>
    );
}
export default Page;