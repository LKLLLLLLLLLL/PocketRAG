import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Tabs, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import './TabsBar.css';

function TabsBar({ tabs, activeKey, onTabChange, onTabEdit, onNewTab }) {
    const tabsContainerRef = useRef(null);
    const [tabWidth, setTabWidth] = useState(250); // 默认250px
    const [containerWidth, setContainerWidth] = useState(0);
    const prevTabsLengthRef = useRef(tabs.length);
    const isCalculatingRef = useRef(false);

    // 强制重新计算并应用宽度
    const recalculateTabWidth = useCallback(() => {
        if (isCalculatingRef.current || !tabsContainerRef.current || tabs.length === 0) {
            return;
        }

        isCalculatingRef.current = true;

        // 使用 requestAnimationFrame 确保DOM完全渲染
        requestAnimationFrame(() => {
            if (tabsContainerRef.current) {
                const container = tabsContainerRef.current;
                const actualWidth = container.offsetWidth;

                // 计算理论需要的总宽度（250px每个标签 + 边距）
                const totalMargin = tabs.length * 6; // 每个标签约6px边距
                const theoreticalWidth = tabs.length * 250 + totalMargin;

                let newTabWidth;
                if (theoreticalWidth > actualWidth && actualWidth > 0) {
                    // 需要缩小：(容器宽度 - 总边距) / 标签数量
                    newTabWidth = Math.floor((actualWidth - totalMargin) / tabs.length);
                    newTabWidth = Math.max(newTabWidth, 80); // 最小80px
                } else {
                    // 使用默认250px
                    newTabWidth = 250;
                }

                // 更新状态和CSS变量
                setTabWidth(newTabWidth);
                setContainerWidth(actualWidth);

                // 直接设置CSS自定义属性，确保立即生效
                container.style.setProperty('--dynamic-tab-width', `${newTabWidth}px`);

                console.log(`标签重新计算: 容器=${actualWidth}px, 标签数=${tabs.length}, 新宽度=${newTabWidth}px`);
            }

            isCalculatingRef.current = false;
        });
    }, [tabs.length]);

    // 监听标签数量变化
    useEffect(() => {
        if (prevTabsLengthRef.current !== tabs.length) {
            prevTabsLengthRef.current = tabs.length;
            // 延迟执行，确保DOM更新完成
            setTimeout(recalculateTabWidth, 100);
        }
    }, [tabs.length, recalculateTabWidth]);

    // 监听activeKey变化，重新计算
    useEffect(() => {
        // 标签切换时重新计算
        setTimeout(recalculateTabWidth, 50);
    }, [activeKey, recalculateTabWidth]);

    // 窗口大小变化处理
    useEffect(() => {
        let timeoutId;

        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(recalculateTabWidth, 150);
        };

        window.addEventListener('resize', handleResize);

        // ResizeObserver 监听容器大小变化
        let resizeObserver;
        if (tabsContainerRef.current && window.ResizeObserver) {
            resizeObserver = new ResizeObserver(() => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(recalculateTabWidth, 100);
            });
            resizeObserver.observe(tabsContainerRef.current);
        }

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', handleResize);
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, [recalculateTabWidth]);

    // 组件挂载后初始计算
    useEffect(() => {
        // 确保DOM渲染完成后再计算
        const timer = setTimeout(recalculateTabWidth, 200);
        return () => clearTimeout(timer);
    }, [recalculateTabWidth]);

    // 阻止双击事件的处理函数
    const handleDoubleClick = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, []);

    // 包装事件处理函数，在操作后重新计算
    const handleTabChangeWithRecalc = useCallback((key) => {
        onTabChange(key);
        // 切换后重新计算
        setTimeout(recalculateTabWidth, 100);
    }, [onTabChange, recalculateTabWidth]);

    const handleTabEditWithRecalc = useCallback((targetKey, action) => {
        onTabEdit(targetKey, action);
        // 编辑后重新计算
        setTimeout(recalculateTabWidth, 100);
    }, [onTabEdit, recalculateTabWidth]);

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
                    onChange={handleTabChangeWithRecalc}
                    onEdit={handleTabEditWithRecalc}
                    items={items}
                    size="small"
                />
            </div>
        </div>
    );
}

export default TabsBar;