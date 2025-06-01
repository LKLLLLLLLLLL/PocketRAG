import gfm from '@bytemd/plugin-gfm'
import highlight from '@bytemd/plugin-highlight'
import { Editor } from '@bytemd/react'
import 'bytemd/dist/index.css'
import zh from 'bytemd/locales/zh_Hans.json'
import 'highlight.js/styles/default.css'
import React, { useCallback, useState } from 'react'
import debounce from 'lodash/debounce'

function TextEditor({activeKey, value}) {
    const plugins = [gfm(), highlight()]

    const [value, setValue] = useState('')

    const updateFile = useCallback(
        debounce((value) => {
            window.electronAPI.updateFile(activeKey, value)
        }, 300),
        [activeKey]
    )

    return (
        <div style={{width: '100vw', height: '100vh'}}>
            <Editor
                mode = 'split'
                locale = {zh}
                value = {value}
                plugins = {plugins}
                onChange = {(v) => {
                    setValue(v)
                    updateFile(v)
                }}
            />
        </div>
    )
}

export default TextEditor;