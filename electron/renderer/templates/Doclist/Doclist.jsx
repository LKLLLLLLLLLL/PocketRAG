import { useState, useEffect, useRef } from 'react';
import { Dropdown, Tree, message} from 'antd';
import './Doclist.css';

const { DirectoryTree } = Tree;

export default function Doclist({ children, setSelectNode }) {
    return (
        <div className="Doclist-container">
            <div className="doclist_top-container">
                <span>项目</span>
                <span className="doclist-refresh-btn" style = {{float:'right'}}>
                </span>
            </div>
            <div className="doclist_main-container">
                <RepoFileTree setSelectNode={setSelectNode} />
                {children}
            </div>
            <div className="doclist_tools-container">
                <div>文件工具栏</div>
            </div>
        </div>
    );
}

const RepoFileTree = ({ setSelectNode }) => {
    const [treeData, setTreeData] = useState([]);
    const [expandedKeys, setExpandedKeys] = useState([]);
    const [rightMenus, setRightMenus] = useState([]);
    const rightTriggerRef = useRef(null);

    // 获取文件树数据
    const fetchTreeData = (needExpand = false) => {
        const repoPath = window.repoPath;
        if (!repoPath) return;
        window.electronAPI.getRepoFileTree(repoPath).then((data) => {
            setTreeData(data);
            if (needExpand && data && data.length > 0) {
                setExpandedKeys([data[0].key]);
            }
        });
    };

    useEffect(() => {
        let isMounted = true;
        window.repoInitializePromise.then(() => {
            if (!isMounted) return;
            fetchTreeData(true);
            window.electronAPI.onRepoFileChanged(() => fetchTreeData(false));
            window.electronAPI.watchRepoDir(window.repoPath);
        });
        return () => { isMounted = false; };
    }, []);

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
        // 只处理文件节点（叶子节点）
        if (node.isLeaf) {
            setSelectNode(node);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <DirectoryTree
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                treeData={treeData}
                onRightClick={handleRightClick}
                onSelect={handleLeftClick}
            />
            <Dropdown menu={{ items: rightMenus }} trigger={['contextMenu']}>
                <div ref={rightTriggerRef} style={{ position: 'absolute' }} />
            </Dropdown>
        </div>
    );
};