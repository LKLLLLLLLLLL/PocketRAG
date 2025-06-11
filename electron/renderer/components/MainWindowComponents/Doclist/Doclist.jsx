// Doclist.jsx
import { useState, useEffect, useRef } from 'react';
import { Dropdown, Tree, message } from 'antd';
import { EllipsisOutlined } from '@ant-design/icons';
import { MenuOutlined } from '@ant-design/icons';
import './Doclist.css';
import { Progress } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';

const { DirectoryTree } = Tree;

const Doclist = ({
    setSelectNode,
    selectNode,
    treeData,
    setTreeData,
    embeddingStatus = {},
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
    // }>

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
                    showProgressBar: true
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
                    // 完成时隐藏进度条，不显示任何图标，但暂时保留在Map中
                    newFileProgressMap.set(filePath, {
                        ...currentState,
                        progress: normalizedProgress,
                        isCompleted: true,
                        showProgressBar: false // 关键：完成后隐藏进度条
                    });
                } else {
                    // 未完成时一直显示进度条
                    newFileProgressMap.set(filePath, {
                        ...currentState,
                        progress: normalizedProgress,
                        isCompleted,
                        showProgressBar: true // 关键：未完成时显示进度条
                    });
                }
            }
        });

        // 移除不再存在的文件
        for (const filePath of newFileProgressMap.keys()) {
            if (!embeddingStatus[filePath]) {
                hasChanges = true;
                newFileProgressMap.delete(filePath);
            }
        }

        if (hasChanges) {
            setFileProgressMap(newFileProgressMap);
        }
    }, [embeddingStatus]);

    // 获取文件的嵌入状态
    const getFileEmbeddingStatus = (filePath) => {
        // 首先尝试直接匹配
        let status = fileProgressMap.get(filePath);
        
        if (!status) {
            // 如果直接匹配失败，尝试使用相对路径匹配
            // 从绝对路径中提取文件名或相对路径
            const fileName = filePath.split('/').pop();
            status = fileProgressMap.get(fileName);
            
            if (!status) {
                // 尝试匹配 repo 路径后的相对路径
                const repoPath = window.repoPath;
                if (repoPath && filePath.startsWith(repoPath)) {
                    const relativePath = filePath.substring(repoPath.length + 1);
                    status = fileProgressMap.get(relativePath);
                }
            }
        }
        
        return status;
    };

    // 渲染嵌入进度组件
    const renderEmbeddingProgress = (filePath) => {
        try {
            const status = getFileEmbeddingStatus(filePath);
            
            // 添加路径匹配调试信息
            if (fileProgressMap.size > 0 && filePath.includes('temp.db')) {
                console.log('=== 路径匹配调试 ===');
                console.log('文件树请求路径:', filePath);
                console.log('当前repoPath:', window.repoPath);
                
                // 尝试提取相对路径
                const fileName = filePath.split('/').pop();
                console.log('提取的文件名:', fileName);
                
                if (window.repoPath && filePath.startsWith(window.repoPath)) {
                    const relativePath = filePath.substring(window.repoPath.length + 1);
                    console.log('提取的相对路径:', relativePath);
                }
                
                console.log('进度Map中的所有键:', Array.from(fileProgressMap.keys()));
                console.log('找到的状态:', status);
                console.log('==================');
            }
            
            if (!status) return null;

            // 显示进度条
            if (status.showProgressBar && typeof status.progress === 'number') {
                const progressPercent = Math.max(0, Math.min(100, Math.round(status.progress * 100)));
                return (
                    <Progress
                        type="circle"
                        percent={progressPercent}
                        size={16}
                        strokeColor="#009090"
                        trailColor="#555"
                        strokeWidth={24}
                        showInfo={false}
                        style={{ marginLeft: '8px' }}
                    />
                );
            }

            return null;
        } catch (error) {
            console.error('渲染嵌入进度错误:', error, '文件路径:', filePath);
            return null;
        }
    };

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
                    renderEmbeddingProgress={renderEmbeddingProgress}
                />
                {children}
            </div>
        </div>
    );
}

const RepoFileTree = ({ setSelectNode, treeData, selectedKeys, setSelectedKeys, renderEmbeddingProgress }) => {
    const [expandedKeys, setExpandedKeys] = useState([]);
    const [rightMenus, setRightMenus] = useState([]);
    const rightTriggerRef = useRef(null);

    // 自定义标题渲染函数
    const titleRender = (nodeData) => {
        try {
            if (!nodeData) return nodeData.title;
            
            const isFile = !nodeData.children || nodeData.children.length === 0;
            let embeddingProgress = null;
            
            if (isFile && renderEmbeddingProgress) {
                try {
                    embeddingProgress = renderEmbeddingProgress(nodeData.key);
                } catch (error) {
                    console.error('嵌入进度渲染错误:', error);
                    embeddingProgress = null;
                }
            }
            
            return (
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    width: '100%',
                    minWidth: 0
                }}>
                    <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        marginRight: '8px',
                        flex: 1
                    }}>
                        {nodeData.title}
                    </span>
                    {embeddingProgress && (
                        <span style={{ flexShrink: 0 }}>
                            {embeddingProgress}
                        </span>
                    )}
                </div>
            );
        } catch (error) {
            console.error('titleRender 错误:', error);
            // 回退到简单的文本渲染
            return nodeData.title;
        }
    };

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
            {treeData && treeData.length > 0 && (
                <DirectoryTree
                    expandedKeys={expandedKeys}
                    onExpand={setExpandedKeys}
                    treeData={treeData}
                    onRightClick={handleRightClick}
                    onSelect={handleLeftClick}
                    selectedKeys={selectedKeys}
                    showIcon={false}
                    className="custom-directory-tree"
                    titleRender={titleRender}
                />
            )}
            <Dropdown menu={{ items: rightMenus }} trigger={['contextMenu']}>
                <div ref={rightTriggerRef} style={{ position: 'absolute' }} />
            </Dropdown>
        </div>
    );
};

export default Doclist;