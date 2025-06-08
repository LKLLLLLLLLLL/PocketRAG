// Doclist.jsx
import { useState, useEffect, useRef } from 'react';
import { Dropdown, Tree, message} from 'antd';
import './Doclist.css';

const { DirectoryTree } = Tree;

export default function Doclist({ children, setSelectNode, selectNode, treeData, setTreeData }) {
    const [selectedKeys, setSelectedKeys] = useState([]);
    
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
            const repoPath = window.repoPath;
            if (!repoPath) return;
            window.electronAPI.getRepoFileTree(repoPath).then((data) => {
                setTreeData(data);
            });
        };

        // 设置定时刷新
        const refreshInterval = setInterval(fetchTreeData, 600000); // 每分钟刷新一次

        // 监听文件变化事件
        window.electronAPI.onRepoFileChanged(fetchTreeData);

        return () => {
            clearInterval(refreshInterval);
            // window.electronAPI.removeRepoFileChangedListener(fetchTreeData);
        };
    }, [setTreeData]);

    return (
        <div className="Doclist-container">
            <div className="doclist_top-container">
                <span>项目</span>
                <span className="doclist-refresh-btn" style = {{float:'right'}}>
                </span>
            </div>
            <div className="doclist_main-container">
                <RepoFileTree 
                    setSelectNode={setSelectNode} 
                    treeData={treeData} 
                    selectedKeys={selectedKeys}
                    setSelectedKeys={setSelectedKeys}
                />
                {children}
            </div>
            <div className="doclist_tools-container">
                <div>文件工具栏</div>
            </div>
        </div>
    );
}

const RepoFileTree = ({ setSelectNode, treeData, selectedKeys, setSelectedKeys }) => {
    const [expandedKeys, setExpandedKeys] = useState([]);
    const [rightMenus, setRightMenus] = useState([]);
    const rightTriggerRef = useRef(null);
    const firstNodeKey = treeData.length > 0 ? treeData[0].key : null;

    // 右键菜单处理
    const handleRightClick = ({ event, node }) => {
        if (node.key === firstNodeKey) return; // 禁止第一个节点右键
        const overlay = rightTriggerRef.current;
        const { pageX, pageY } = event;
        overlay.style.left = `${pageX}px`;
        overlay.style.top = `${pageY}px`;
        setSelectNode(node); // 设置选中的节点
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
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <DirectoryTree
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                treeData={treeData}
                onRightClick={handleRightClick}
                onSelect={handleLeftClick}
                selectedKeys={selectedKeys}
                className="custom-directory-tree"
            />
            <Dropdown menu={{ items: rightMenus }} trigger={['contextMenu']}>
                <div ref={rightTriggerRef} style={{ position: 'absolute' }} />
            </Dropdown>
        </div>
    );
};