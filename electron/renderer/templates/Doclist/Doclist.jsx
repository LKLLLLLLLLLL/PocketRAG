import React, { useState, useEffect, useRef } from 'react';
import { Dropdown, Tree, message, Button } from 'antd';
import { RedoOutlined } from '@ant-design/icons';
import './Doclist.css';

const { DirectoryTree } = Tree;

export default function Doclist({ children, handleRefresh }) {
  return (
    <div className="Doclist-container">
      <div className="doclist_top-container">
        <span>项目</span>
        <span className="doclist-refresh-btn" style = {{float:'right'}}>
        </span>
      </div>
      <div className="doclist_main-container">
        <RepoFileTree />
        {children}
      </div>
      <div className="doclist_tools-container">
        <div>文件工具栏</div>
      </div>
    </div>
  );
}

function RepoFileTree() {
  const [treeData, setTreeData] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [rightMenus, setRightMenus] = useState([]);
  const [selectNode, setSelectNode] = useState(null);
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
    setSelectNode(node);
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DirectoryTree
        expandedKeys={expandedKeys}
        onExpand={setExpandedKeys}
        treeData={treeData}
        onRightClick={handleRightClick}
      />
      <Dropdown menu={{ items: rightMenus }} trigger={['contextMenu']}>
        <div ref={rightTriggerRef} style={{ position: 'absolute' }} />
      </Dropdown>
    </div>
  );
}