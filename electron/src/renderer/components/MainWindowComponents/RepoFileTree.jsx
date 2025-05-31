import React, { useState, useEffect, useRef } from 'react'
import { Dropdown, Tree, message, Button } from 'antd'

const { DirectoryTree } = Tree

function RepoFileTree() {
  const [treeData, setTreeData] = useState([])
  const [currentPath, setCurrentPath] = useState('')
  const [rightMenus, setRightMenus] = useState([])
  const [selectNode, setSelectNode] = useState(null)
  const rightTriggerRef = useRef(null)
  const [expandedKeys, setExpandedKeys] = useState([])

  // 封装刷新逻辑
  const fetchTreeData = () => {
    console.log('Fetching file tree data...')
    const repoPath = window.repoPath
    if (!repoPath) return
    window.electronAPI.getRepoFileTree(repoPath).then((data) => {
      setTreeData(data)
      setCurrentPath(repoPath)
      if (data && data.length > 0) {
        setExpandedKeys([data[0].key]) // 自动展开第一个节点
      }
    })
  }

  useEffect(() => {
    let isMounted = true
    window.repoInitializePromise.then(() => {
      if (!isMounted) return
      fetchTreeData()
    })
    return () => { isMounted = false }
  }, [])

  const firstNodeKey = treeData.length > 0 ? treeData[0].key : null
  const handleRightClick = ({event, node}) => {
    // 如果是第一个节点，禁止右键菜单
    if (node.key === firstNodeKey) return

    const overlay = rightTriggerRef.current
    const {pageX, pageY} = event
    overlay.style.left = `${pageX}px`
    overlay.style.top = `${pageY}px`
    setSelectNode(node)
    const items = [
      {
        key: 'delete',
        label: '删除',
        onClick: () => {
          message.info(`删除 ${node.title}`)
          //删除逻辑
        }
      },
      {
        key: 'rename',
        label: '重命名',
        onClick: () => {
          message.info(`重命名 ${node.title}`)
          //重命名逻辑
        }
      }
    ]
    setRightMenus(items)
    setTimeout(() => {
      const evt = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        clientX: pageX,
        clientY: pageY
      })
      overlay.dispatchEvent(evt)
    })
  }

  return (
    <div style = {{ position: 'relative', width: '100%', height: '100%'}}>
      <Button onClick={fetchTreeData} size="small" style={{ marginBottom: 8 }}>
        刷新文件树
      </Button>
      <DirectoryTree
        expandedKeys = {expandedKeys}
        onExpand = {setExpandedKeys}
        treeData = {treeData}
        onRightClick = {handleRightClick}
      />
      <Dropdown
        menu = {{items: rightMenus}}
        trigger = {['contextMenu']}
      >
        <div ref = {rightTriggerRef} style = {{position: 'absolute'}}></div>
      </Dropdown>
    </div>
  )
}

export default RepoFileTree