import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Tabs, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import './TabsBar.css';

function TabsBar({ tabs, activeKey, onTabChange, onTabEdit, onNewTab }) {
    const tabsContainerRef = useRef(null);
    const [tabWidth, setTabWidth] = useState(250);
    const isCalculatingRef = useRef(false);
    const lastCalculatedRef = useRef({
        tabsLength: 0,
        containerWidth: 0,
        tabWidth: 250
    });

    // 一次性计算标签宽度，避免频繁更新
    const calculateTabWidth = useCallback(() => {
        if (isCalculatingRef.current || !tabsContainerRef.current || tabs.length === 0) {
            return;
        }

        const container = tabsContainerRef.current;
        const actualWidth = container.offsetWidth;
        const currentTabsLength = tabs.length;

        // 只有在标签数量或容器宽度真正变化时才计算
        const lastCalc = lastCalculatedRef.current;
        if (
            actualWidth === lastCalc.containerWidth && 
            currentTabsLength === lastCalc.tabsLength &&
            actualWidth > 0
        ) {
            return; // 无需重新计算
        }

        isCalculatingRef.current = true;

        // 计算新的标签宽度
        const totalMargin = currentTabsLength * 6; // 每个标签约6px边距
        const theoreticalWidth = currentTabsLength * 250 + totalMargin;

        let newTabWidth;
        if (theoreticalWidth > actualWidth && actualWidth > 0) {
            // 需要缩小：(容器宽度 - 总边距) / 标签数量
            newTabWidth = Math.floor((actualWidth - totalMargin) / currentTabsLength);
            newTabWidth = Math.max(newTabWidth, 80); // 最小80px
        } else {
            // 使用默认250px
            newTabWidth = 250;
        }

        // 只有宽度真正变化时才更新
        if (Math.abs(newTabWidth - lastCalc.tabWidth) > 1) {
            setTabWidth(newTabWidth);
            
            // 直接设置CSS自定义属性，立即生效
            container.style.setProperty('--dynamic-tab-width', `${newTabWidth}px`);

            // 更新缓存
            lastCalculatedRef.current = {
                tabsLength: currentTabsLength,
                containerWidth: actualWidth,
                tabWidth: newTabWidth
            };

            console.log(`标签重新计算: 容器=${actualWidth}px, 标签数=${currentTabsLength}, 新宽度=${newTabWidth}px`);
        }

        isCalculatingRef.current = false;
    }, [tabs.length]); // 只依赖标签数量

    // 只在标签数量变化时计算 - 移除所有其他触发条件
    useEffect(() => {
        if (tabs.length !== lastCalculatedRef.current.tabsLength) {
            // 立即计算，不使用延迟
            calculateTabWidth();
        }
    }, [tabs.length, calculateTabWidth]);

    // 窗口大小变化处理 - 使用节流
    useEffect(() => {
        let timeoutId;

        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(calculateTabWidth, 300); // 增加延迟，减少频率
        };

        window.addEventListener('resize', handleResize);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', handleResize);
        };
    }, [calculateTabWidth]);

    // 组件挂载后初始计算
    useEffect(() => {
        const timer = setTimeout(calculateTabWidth, 100);
        return () => clearTimeout(timer);
    }, []); // 只在挂载时执行一次

    // 阻止双击事件的处理函数
    const handleDoubleClick = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, []);

    // 移除所有重新计算逻辑，避免循环
    const handleTabChangeWithoutRecalc = useCallback((key) => {
        onTabChange(key);
        // 不再自动重新计算
    }, [onTabChange]);

    const handleTabEditWithoutRecalc = useCallback((targetKey, action) => {
        onTabEdit(targetKey, action);
        // 不再自动重新计算，由 useEffect 监听 tabs.length 变化
    }, [onTabEdit]);

    // 缓存 items 计算
    const items = useMemo(() => tabs.map(tab => ({
        key: tab.key,
        label: (
            <span
                className="tab-label-text"
                title={tab.label}
                onDoubleClick={handleDoubleClick}
            >
                {tab.label}
                <span className="tab-right-corner"></span>
            </span>
        ),
        closable: true,
    })), [tabs, handleDoubleClick]);

    return (
        <div className="tabsbar-root">
            <div
                ref={tabsContainerRef}
                className="tabsbar"
                style={{
                    '--dynamic-tab-width': `${tabWidth}px`
                }}
                onDoubleClick={handleDoubleClick}
            >
                <Tabs
                    hideAdd
                    type="editable-card"
                    activeKey={activeKey}
                    onChange={handleTabChangeWithoutRecalc}
                    onEdit={handleTabEditWithoutRecalc}
                    items={items}
                    size="small"
                />
            </div>
        </div>
    );
}

export default TabsBar;