// TabsBar.jsx
import React from 'react';
import { Tabs, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import './TabsBar.css';

function TabsBar({ tabs, activeKey, onTabChange, onTabEdit, onNewTab }) {
    const items = tabs.map(tab => ({
        key: tab.key,
        label: tab.label,
        closable: tabs.length > 1,
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