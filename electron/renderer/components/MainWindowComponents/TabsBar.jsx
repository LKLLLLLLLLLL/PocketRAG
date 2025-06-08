// TabsBar.jsx
import React from 'react';
import { Tabs, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import './TabsBar.css';

function TabsBar({ tabs, activeKey, onTabChange, onTabEdit, onNewTab }) {
    const items = tabs.map(tab => ({
        key: tab.key,
        label: (
            <span
                className="tab-label-text"
                title={tab.label} // 添加tooltip显示完整文本
            >
                {tab.label}
                <span className="tab-bottom-left"></span>
                <span className="tab-bottom-right"></span>
            </span>
        ),
        closable: true, // 所有标签都可以关闭，包括最后一个
    }));

    return (
        <div className="tabsbar-root">
            <Tabs
                hideAdd
                type="editable-card"
                activeKey={activeKey}
                onChange={onTabChange}
                onEdit={onTabEdit}
                className='tabsbar'
                items={items}
                // tabBarExtraContent={
                //     <Button 
                //         type="text" 
                //         icon={<PlusOutlined />} 
                //         onClick={onNewTab}
                //         className="new-tab-btn"
                //         title="新建标签"
                //     />
                // }
                size="small"
            />
        </div>
    );
}

export default TabsBar;