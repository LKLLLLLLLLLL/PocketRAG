// Doclist.jsx
import { useState, useEffect, useRef,children } from 'react';
import { Dropdown, Tree, message} from 'antd';
import { EllipsisOutlined } from '@ant-design/icons';
import { MenuOutlined } from '@ant-design/icons';
import './Doclist.css';
import { Progress, Table, Button, Collapse } from 'antd';
import { CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons';

const { DirectoryTree } = Tree;

const Doclist = ({
    setSelectNode,
    selectNode,
    treeData,
    setTreeData,
    embeddingStatus = {},
    showEmbeddingTable = false,
    onToggleEmbeddingTable
}) => {
    const [selectedKeys, setSelectedKeys] = useState([]);
    
    // 修改创建嵌入进度数据源函数
    const createEmbeddingTableData = () => {
        const embeddingFiles = Object.keys(embeddingStatus).map(filePath => {
            const fileName = filePath.split('/').pop() || filePath;
            const statusData = embeddingStatus[filePath];

            // 处理可能的对象格式 {status: 'processing', progress: 0.5}
            let status, progress;
            if (typeof statusData === 'object') {
                status = statusData.status;
                progress = statusData.progress;
            } else {
                status = statusData;
                progress = null;
            }

            return {
                key: filePath,
                fileName,
                filePath,
                status,
                progress: getProgressPercent(status, progress),
                rawProgress: progress // 保留原始进度值用于调试
            };
        });

        return embeddingFiles;
    };

    // 修改获取进度百分比函数，处理浮点数
    const getProgressPercent = (status, progress) => {
        // 如果有具体的进度值（浮点数），优先使用
        if (typeof progress === 'number' && progress >= 0) {
            return Math.round(progress * 100); // 将0-1的浮点数转换为0-100的百分比
        }

        // 否则根据状态返回默认值
        switch (status) {
            case 'pending': return 0;
            case 'processing': return 50;
            case 'completed': return 100;
            case 'failed': return 0;
            default: return 0;
        }
    };

    // 获取进度条颜色
    const getProgressColor = (status) => {
        switch (status) {
            case 'pending': return '#faad14';
            case 'processing': return '#1890ff';
            case 'completed': return '#52c41a';
            case 'failed': return '#ff4d4f';
            default: return '#d9d9d9';
        }
    };

    // 获取状态文本
    const getStatusText = (status) => {
        switch (status) {
            case 'pending': return '等待中';
            case 'processing': return '嵌入中';
            case 'completed': return '已完成';
            case 'failed': return '失败';
            default: return '未知';
        }
    };

    // 修改表格列定义，添加居中对齐
    const embeddingColumns = [
        {
            title: '文件名',
            dataIndex: 'fileName',
            key: 'fileName',
            width: '100px', // 调整宽度分配
            ellipsis: true,
            align: 'center', // 标题居中
        },
        {
            title: '进度',
            dataIndex: 'progress',
            key: 'progress',
            width: '50px', // 调整宽度分配
            align: 'center', // 标题居中
            render: (progress, record) => (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <Progress
                        type="circle"
                        percent={progress}
                        size={24}
                        strokeColor={getProgressColor(record.status)}
                        showInfo={false}
                    />
                    <span style={{
                        fontSize: '12px',
                        color: '#999',
                        minWidth: '35px'
                    }}>
                        {progress}%
                    </span>
                </div>
            ),
        }
    ];

    // 当外部选择的节点变化时，更新选中状态
    useEffect(() => {
        if (selectNode && selectNode.key) {
            setSelectedKeys([selectNode.key]);
        } else {
            setSelectedKeys([]);
        }
    }, [selectNode]);

    // 文件树自动刷新功能
    useEffect(() => {
        const fetchTreeData = () => {
            console.log('fetching data ...')
            const repoPath = window.repoPath;
            if (!repoPath) return;
            window.electronAPI.getRepoFileTree(repoPath).then((data) => {
                setTreeData(data);
            });
        };

        const repoFileTreeInit = async () => {
            await window.repoInitializePromise
            fetchTreeData()
            // 监听文件变化事件
            window.electronAPI.onRepoFileChanged(fetchTreeData);
            window.electronAPI.watchRepoDir(window.repoPath);
        }

        repoFileTreeInit()
    }, []);

    return (
        <div className="Doclist-container">
            <div className="doclist_top-container" onClick={async () => { await window.openRepoListWindow() }}>
                <span style = {{color: 'white'}}>{window.repoName}</span>
                <span className="doclist-refresh-btn" style = {{float:'right'}}>
                </span>
                {/* <EllipsisOutlined style= {{fontSize:"20px"}}/> */}
                <MenuOutlined style={{ fontSize: "16px" }} />
            </div>
            <div className="doclist_main-container">
                <RepoFileTree 
                    setSelectNode={setSelectNode} 
                    treeData={treeData} 
                    selectedKeys={selectedKeys}
                    setSelectedKeys={setSelectedKeys}
                />
                {/* 嵌入进度表格 */}
                {Object.keys(embeddingStatus).length > 0 && (
                    <div className="embedding-progress-section">
                        <div className="embedding-header">
                            <Button
                                type="text"
                                icon={showEmbeddingTable ? <CaretDownOutlined /> : <CaretRightOutlined />}
                                onClick={onToggleEmbeddingTable}
                                className="embedding-toggle-btn"
                            >
                                嵌入进度 ({Object.keys(embeddingStatus).length})
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

    // 右键菜单处理
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
    
    // 处理左键点击
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