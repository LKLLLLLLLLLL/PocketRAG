// Doclist.jsx
import { useState, useEffect, useRef } from 'react';
import { Dropdown, Tree, message} from 'antd';
import { EllipsisOutlined } from '@ant-design/icons';
import { MenuOutlined } from '@ant-design/icons';
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