import { useEffect, useState } from 'react'
import { Tabs } from 'antd'
import TextEditor from './textEditor'

function TabsBar() {
    const [tabs, setTabs] = useState([])
    const [activeKey, setActiveKey] = useState('')
    const [value, setValue] = useState('')
    const handleSelect = (keys, {node}) => {
        const key = keys[0]
        if(!node.isLeaf) {
            return
        }
        const newTabs = [...tabs]
        const exist = newTabs.find((tab) => tab.key === key)
        if(!exist) {
            newTabs.push({
                key,
                title: node.title,
            })
            setTabs(newTabs)
        }
        setActiveKey(key)
    }

    useEffect(() => {
        if(!activeKey) {
            return
        }
        const receiveFile = async () => {
            const res = await window.electronAPI.getFile(activeKey)
            setValue(res)
        }
        receiveFile()
    }, [activeKey])

    const onEdit = (targetKey) => {
        const remove = (targetKey) => {
            let newActiveKey = activeKey
            let lastIndex = -1
            tabs.forEach((item, i) => {
                if(item.key === targetKey) {
                    lastIndex = i - 1
                }
            })
            const newPanes = tabs.filter((item) => item.key !== targetKey)
            if(newPanes.length && newActiveKey === targetKey) {
                if(lastIndex >= 0) {
                    newActiveKey = newPanes[lastIndex].key
                }
                else {
                    newActiveKey = newPanes[0].key
                }
            }
            if(newPanes.length === 0) {
                newActiveKey = ''
            }
            setTabs(newPanes)
            setActiveKey(newActiveKey)
        }
        remove(targetKey)
    }


    return (
        <div>
            <Tabs
                hideAdd
                type = "editable-card"
                activeKey = {activeKey}
                onChange = {(key) => setActiveKey(key)}
                onEdit = {onEdit}
                items = {tabs}
            />
            <TextEditor
                activeKey = {activeKey}
                value = {value}
            />
        </div>
    )
}

export default TabsBar