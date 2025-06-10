import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Tabs } from 'antd';
import { CloseOutlined, FileOutlined } from '@ant-design/icons';
import './TabsBar.css';

// 简单的标签节点组件
const TabNode = ({tab}) => {
  return (
    <div className="vscode-tab">
      <div className="vscode-tab-content">
        <FileOutlined className="vscode-tab-icon" />
        <span 
          className="vscode-tab-label"
          title={tab.label}
        >
          {tab.label}
        </span>
        <CloseOutlined 
          className="vscode-tab-close"
          onClick={(e) => {
            e.stopPropagation();
            tab.onClose(tab.key);
          }}
        />
      </div>
    </div>
  );
};

function TabsBar({ tabs, activeKey, onTabChange, onTabEdit, onNewTab }) {
    const tabsContainerRef = useRef(null);
    const [tabWidth, setTabWidth] = useState(200); // VSCode默认值
    const isCalculatingRef = useRef(false);
    const lastCalculatedRef = useRef({
        tabsLength: 0,
        containerWidth: 0,
        tabWidth: 200
    });

    // 计算标签宽度
    const calculateTabWidth = useCallback(() => {
        if (isCalculatingRef.current || !tabsContainerRef.current || tabs.length === 0) {
            return;
        }

        const container = tabsContainerRef.current;
        const actualWidth = container.offsetWidth;
        const currentTabsCount = tabs.length;

        // 如果没有足够改变，则跳过计算
        if (actualWidth === lastCalculatedRef.current.containerWidth &&
            currentTabsCount === lastCalculatedRef.current.tabsLength) {
            return;
        }

        isCalculatingRef.current = true;

        // 优化后的宽度计算
        const minTabWidth = 120;
        const maxTabWidth = 200;
        const spacing = 1; // 标签之间的间距

        // 将容器宽度减去固定的按钮宽度和所有标签间距
        let availableWidth = actualWidth - (spacing * (currentTabsCount - 1));

        // 计算单个标签的宽度
        let newTabWidth = Math.floor(availableWidth / currentTabsCount);

        // 约束标签宽度在最小和最大值之间
        newTabWidth = Math.min(Math.max(newTabWidth, minTabWidth), maxTabWidth);

        setTabWidth(newTabWidth);
        container.style.setProperty('--tab-width', `${newTabWidth}px`);

        lastCalculatedRef.current = {
            tabsLength: currentTabsCount,
            containerWidth: actualWidth,
            tabWidth: newTabWidth
        };

        isCalculatingRef.current = false;
    }, [tabs.length]);

    // 监听标签数量变化
    useEffect(() => {
        calculateTabWidth();
    }, [tabs.length, calculateTabWidth]);

    // 监听窗口大小变化
    useEffect(() => {
        const handleResize = () => {
            calculateTabWidth();
        };

        const resizeObserver = new ResizeObserver(handleResize);
        if (tabsContainerRef.current) {
            resizeObserver.observe(tabsContainerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [calculateTabWidth]);

    // 渲染标签项
    const tabItems = useMemo(() => {
        return tabs.map((tab) => {
            const isActive = tab.key === activeKey;
            
            return {
                key: tab.key,
                label: (
                    <div className={`vscode-tab-wrapper ${isActive ? 'active' : ''}`}>
                        <TabNode
                            tab={{
                                ...tab,
                                onClose: (key) => onTabEdit(key, 'remove')
                            }}
                        />
                    </div>
                ),
                closable: false, // 我们使用自定义关闭按钮
                destroyOnHidden: false,
                forceRender: true
            };
        });
    }, [tabs, activeKey, onTabEdit]);

    return (
        <div className="tabsbar-root vscode-theme">
            <div
                ref={tabsContainerRef}
                className="tabsbar vscode-tabs-container"
                style={{
                    '--tab-width': `${tabWidth}px`
                }}
            >
                <Tabs
                    hideAdd
                    type="card"
                    activeKey={activeKey}
                    onChange={onTabChange}
                    items={tabItems}
                    className="vscode-tabs"
                    renderTabBar={(props, DefaultTabBar) => (
                        <DefaultTabBar {...props} className="vscode-tab-bar" />
                    )}
                />
                
                <div className="vscode-new-tab" onClick={onNewTab}>
                    <span className="vscode-new-tab-plus">+</span>
                </div>
            </div>
        </div>
    );
}

export default TabsBar;