import React from 'react';
import { Tabs, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import './TabsBar.css';

function TabsBar({ tabs, activeKey, onTabChange, onTabEdit, onNewTab }) {
    return (
        <div className="tabsbar-root">
            <Tabs
                hideAdd
                type="editable-card"
                activeKey={activeKey}
                onChange={onTabChange}
                onEdit={onTabEdit}
                className='tabsbar'
                tabBarExtraContent={
                    <Button 
                        type="text" 
                        icon={<PlusOutlined />} 
                        onClick={onNewTab}
                        className="new-tab-btn"
                        title="新建标签"
                    />
                }
            >
                {tabs.map(tab => (
                    <Tabs.TabPane 
                        key={tab.key} 
                        tab={tab.label}
                        closable={tabs.length > 1}
                    />
                ))}
            </Tabs>
        </div>
    );
}

export default TabsBar;