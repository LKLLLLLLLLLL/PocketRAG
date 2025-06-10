// Doclist.jsx
import { useState, useEffect, useRef } from 'react';
import { Dropdown, Tree, message } from 'antd';
import { EllipsisOutlined } from '@ant-design/icons';
import { MenuOutlined } from '@ant-design/icons';
import './Doclist.css';
import { Progress, Table, Button, Collapse } from 'antd';
import { CaretRightOutlined, CaretDownOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { DirectoryTree } = Tree;

const Doclist = ({
    setSelectNode,
    selectNode,
    treeData,
    setTreeData,
    embeddingStatus = {},
    showEmbeddingTable = false,
    onToggleEmbeddingTable,
    children
}) => {
    const [selectedKeys, setSelectedKeys] = useState([]);

    // 专门记录文件嵌入进度的状态
    const [fileProgressMap, setFileProgressMap] = useState(new Map());
    // fileProgressMap 结构: Map<filePath, {
    //   fileName: string,
    //   progress: number,           // 0-1 的浮点数
    //   isCompleted: boolean,       // progress === 1
    //   showProgressBar: boolean,   // 是否显示进度条
    //   showSuccessIcon: boolean,   // 是否显示成功图标
    //   successTimer: number        // 成功图标定时器ID
    // }>

    // 表格是否应该显示
    const [shouldShowTable, setShouldShowTable] = useState(false);

    // 所有文件完成后的5秒隐藏定时器
    const [hideTableTimer, setHideTableTimer] = useState(null);

    // 监听 embeddingStatus 变化，更新文件进度
    useEffect(() => {
        const newFileProgressMap = new Map(fileProgressMap);
        let hasChanges = false;

        Object.entries(embeddingStatus).forEach(([filePath, statusData]) => {
            let status, rawProgress;
            if (typeof statusData === 'object') {
                status = statusData.status;
                rawProgress = statusData.progress;
            } else {
                status = statusData;
                rawProgress = null;
            }

            const fileName = filePath.split('/').pop() || filePath;
            const currentState = newFileProgressMap.get(filePath);

            // 新文件初始化
            if (!currentState) {
                newFileProgressMap.set(filePath, {
                    fileName,
                    progress: 0,
                    isCompleted: false,
                    showProgressBar: true,
                    showSuccessIcon: false,
                    successTimer: null
                });
                hasChanges = true;
                return; // 跳过后续逻辑，等待下次 useEffect 触发
            }

            // 标准化 progress
            let normalizedProgress = 0;
            if (typeof rawProgress === 'number') {
                if (rawProgress >= 0 && rawProgress <= 1) {
                    normalizedProgress = rawProgress;
                } else if (rawProgress > 1 && rawProgress <= 100) {
                    normalizedProgress = rawProgress / 100;
                }
            } else {
                switch (status) {
                    case 'pending':
                        normalizedProgress = 0;
                        break;
                    case 'processing':
                        normalizedProgress = currentState?.progress || 0.1;
                        break;
                    case 'done':
                        normalizedProgress = 1;
                        break;
                    default:
                        normalizedProgress = 0;
                }
            }

            const isCompleted = normalizedProgress >= 1;

            // 判断是否需要更新
            if (
                Math.abs(currentState.progress - normalizedProgress) > 0.001 ||
                currentState.isCompleted !== isCompleted
            ) {
                hasChanges = true;

                if (isCompleted && !currentState.isCompleted) {
                    // 完成时隐藏进度条，显示成功图标
                    if (currentState?.successTimer) clearTimeout(currentState.successTimer);
                    const timer = setTimeout(() => {
                        setFileProgressMap(prev => {
                            const updated = new Map(prev);
                            const state = updated.get(filePath);
                            if (state) {
                                updated.set(filePath, {
                                    ...state,
                                    showSuccessIcon: false,
                                    successTimer: null
                                });
                            }
                            return updated;
                        });
                    }, 3000);

                    newFileProgressMap.set(filePath, {
                        ...currentState,
                        progress: normalizedProgress,
                        isCompleted: true,
                        showProgressBar: false, // 关键：完成后隐藏进度条
                        showSuccessIcon: true,
                        successTimer: timer
                    });
                } else {
                    // 未完成时一直显示进度条
                    newFileProgressMap.set(filePath, {
                        ...currentState,
                        progress: normalizedProgress,
                        isCompleted,
                        showProgressBar: true, // 关键：未完成时显示进度条
                        showSuccessIcon: currentState?.showSuccessIcon || false,
                        successTimer: currentState?.successTimer || null
                    });
                }
            }
        });

        // 移除不再存在的文件
        for (const filePath of newFileProgressMap.keys()) {
            if (!embeddingStatus[filePath]) {
                hasChanges = true;
                const state = newFileProgressMap.get(filePath);
                if (state?.successTimer) clearTimeout(state.successTimer);
                newFileProgressMap.delete(filePath);
            }
        }

        if (hasChanges) setFileProgressMap(newFileProgressMap);
    }, [embeddingStatus]);

    // 监听文件进度变化，决定表格显示/隐藏
    useEffect(() => {
        const states = Array.from(fileProgressMap.values());

        if (states.length === 0) {
            setShouldShowTable(false);
            if (hideTableTimer) {
                clearTimeout(hideTableTimer);
                setHideTableTimer(null);
            }
            return;
        }

        const allCompleted = states.every(state => state.isCompleted);
        const hasIncompleteFiles = states.some(state => !state.isCompleted);

        if (hasIncompleteFiles) {
            setShouldShowTable(true);
            if (hideTableTimer) {
                clearTimeout(hideTableTimer);
                setHideTableTimer(null);
            }
        } else if (allCompleted) {
            const allSuccessIconsHidden = states.every(state => !state.showSuccessIcon);

            if (allSuccessIconsHidden && !hideTableTimer) {
                const timer = setTimeout(() => {
                    setShouldShowTable(false);
                    setFileProgressMap(new Map());
                    setHideTableTimer(null);
                }, 5000);
                setHideTableTimer(timer);
            }
            setShouldShowTable(true);
        }
    }, [fileProgressMap, hideTableTimer]);

    // 组件卸载时清理所有定时器
    useEffect(() => {
        return () => {
            fileProgressMap.forEach(state => {
                if (state.successTimer) {
                    clearTimeout(state.successTimer);
                }
            });
            if (hideTableTimer) {
                clearTimeout(hideTableTimer);
            }
        };
    }, []);

    // 创建表格数据源
    const createEmbeddingTableData = () => {
        return Array.from(fileProgressMap.entries()).map(([filePath, state]) => ({
            key: filePath,
            fileName: state.fileName,
            filePath,
            progress: state.progress,
            isCompleted: state.isCompleted,
            showProgressBar: state.showProgressBar,
            showSuccessIcon: state.showSuccessIcon
        }));
    };

    // 表格列定义
    const embeddingColumns = [
        {
            title: '文件名',
            dataIndex: 'fileName',
            key: 'fileName',
            width: '60%',
            ellipsis: true,
            align: 'left',
        },
        {
            title: '进度',
            dataIndex: 'progress',
            key: 'progress',
            width: '40%',
            align: 'center',
            render: (progress, record) => {
                // 完成后显示成功图标
                if (record.showSuccessIcon) {
                    return (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <CheckCircleOutlined style={{
                                fontSize: '16px',
                                color: '#52c41a'
                            }} />
                            <span style={{
                                fontSize: '12px',
                                color: '#52c41a',
                                minWidth: '35px'
                            }}>
                                完成
                            </span>
                        </div>
                    );
                }
                // 只在 showProgressBar 为 true 时显示进度条
                if (record.showProgressBar) {
                    const progressPercent = Math.round(progress * 100);
                    const progressColor = progress >= 1 ? '#52c41a' : '#1890ff';
                    return (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <Progress
                                type="circle"
                                percent={progressPercent}
                                size={20}
                                strokeColor={progressColor}
                                showInfo={false}
                            />
                            <span style={{
                                fontSize: '12px',
                                color: '#999',
                                minWidth: '35px'
                            }}>
                                {progressPercent}%
                            </span>
                        </div>
                    );
                }
                return null;
            },
        }
    ];

    useEffect(() => {
        if (selectNode && selectNode.key) {
            setSelectedKeys([selectNode.key]);
        } else {
            setSelectedKeys([]);
        }
    }, [selectNode]);

    useEffect(() => {
        const fetchTreeData = () => {
            const repoPath = window.repoPath;
            if (!repoPath) return;
            window.electronAPI.getRepoFileTree(repoPath).then((data) => {
                setTreeData(data);
            });
        };

        const repoFileTreeInit = async () => {
            await window.repoInitializePromise
            fetchTreeData()
            window.electronAPI.onRepoFileChanged(fetchTreeData);
            window.electronAPI.watchRepoDir(window.repoPath);
        }

        repoFileTreeInit()
    }, []);

    return (
        <div className="Doclist-container">
            <div className="doclist_top-container" onClick={async () => { await window.openRepoListWindow() }}>
                <span style={{ color: 'white' }}>{window.repoName}</span>
                <span className="doclist-refresh-btn" style={{ float: 'right' }}>
                </span>
                <MenuOutlined style={{ fontSize: "16px" }} />
            </div>
            <div className="doclist_main-container">
                <RepoFileTree
                    setSelectNode={setSelectNode}
                    treeData={treeData}
                    selectedKeys={selectedKeys}
                    setSelectedKeys={setSelectedKeys}
                />
                {/* 嵌入进度表格 - 只有当应该显示时才显示 */}
                {shouldShowTable && (
                    <div className="embedding-progress-section">
                        <div className="embedding-header">
                            <Button
                                type="text"
                                icon={showEmbeddingTable ? <CaretDownOutlined /> : <CaretRightOutlined />}
                                onClick={() => onToggleEmbeddingTable(!showEmbeddingTable)}
                                className="embedding-toggle-btn"
                                style={{ fontSize: '12px', padding: '4px 8px' }}
                            >
                                嵌入进度 ({fileProgressMap.size})
                            </Button>
                        </div>

                        {showEmbeddingTable && (
                            <div className="embedding-table-wrapper">
                                <Table
                                    columns={embeddingColumns}
                                    dataSource={createEmbeddingTableData()}
                                    size="small"
                                    pagination={false}
                                    scroll={{ y: 200 }}
                                    className="embedding-progress-table"
                                    rowKey="filePath"
                                />
                            </div>
                        )}
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}

const RepoFileTree = ({ setSelectNode, treeData, selectedKeys, setSelectedKeys }) => {
    const [expandedKeys, setExpandedKeys] = useState([]);
    const [rightMenus, setRightMenus] = useState([]);
    const rightTriggerRef = useRef(null);

    const handleRightClick = ({ event, node }) => {
        const overlay = rightTriggerRef.current;
        const { pageX, pageY } = event;
        overlay.style.left = `${pageX}px`;
        overlay.style.top = `${pageY}px`;
        setRightMenus([
            {
                key: 'delete',
                label: '删除',
                onClick: () => message.info(`删除 ${node.title}`)
            },
            {
                key: 'rename',
                label: '重命名',
                onClick: () => message.info(`重命名 ${node.title}`)
            }
        ]);
        setTimeout(() => {
            const evt = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 2,
                clientX: pageX,
                clientY: pageY
            });
            overlay.dispatchEvent(evt);
        });
    };

    const handleLeftClick = (keys, { node, nativeEvent }) => {
        setSelectNode(node);
        setSelectedKeys([node.key]);
    };

    return (
        <div>
            <DirectoryTree
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                treeData={treeData}
                onRightClick={handleRightClick}
                onSelect={handleLeftClick}
                selectedKeys={selectedKeys}
                showIcon={false}
                className="custom-directory-tree"
            />
            <Dropdown menu={{ items: rightMenus }} trigger={['contextMenu']}>
                <div ref={rightTriggerRef} style={{ position: 'absolute' }} />
            </Dropdown>
        </div>
    );
};

export default Doclist;