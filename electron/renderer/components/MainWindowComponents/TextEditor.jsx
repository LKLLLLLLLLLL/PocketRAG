import gfm from '@bytemd/plugin-gfm'
import highlight from '@bytemd/plugin-highlight'
import { Editor } from '@bytemd/react'
import 'bytemd/dist/index.css'
import zh from 'bytemd/locales/zh_Hans.json'
import 'highlight.js/styles/default.css'
import React, { useCallback, useState, useEffect } from 'react'
import debounce from 'lodash/debounce'

function TextEditor({ activeKey, value0 }) {
    const plugins = [gfm(), highlight()]

    const [value, setValue] = useState(value0 || '')

    // 当 value0 变化时同步到编辑器
    useEffect(() => {
        setValue(value0 || '')
    }, [value0])

    const updateFile = useCallback(
        debounce((v) => {
            window.electronAPI.updateFile(activeKey, v)
        }, 300),
        [activeKey]
    )

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Editor
                mode='split'
                locale={zh}
                value={value}
                plugins={plugins}
                onChange={(v) => {
                    setValue(v)
                    updateFile(v)
                }}
            />
        </div>
    )
}

export default TextEditor;