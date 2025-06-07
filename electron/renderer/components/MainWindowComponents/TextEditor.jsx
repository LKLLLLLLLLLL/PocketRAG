// TextEditor.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { Button, message } from 'antd';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import { Editor } from '@bytemd/react';
import 'bytemd/dist/index.css';
import zh from 'bytemd/locales/zh_Hans.json';
import 'highlight.js/styles/default.css';
import debounce from 'lodash/debounce';
import './TextEditor.css';

function TextEditor({ activeKey, filePath, content, loadFileContent, updateFileContent, saveFileContent }) {
    const plugins = [gfm(), highlight()];
    const [value, setValue] = useState(content || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // 当activeKey变化时加载文件内容
    useEffect(() => {
        if (!activeKey || !filePath) {
            setValue('');
            return;
        }
        
        const loadContent = async () => {
            setIsLoading(true);
            try {
                const fileContent = await loadFileContent(filePath);
                setValue(fileContent);
            } catch (error) {
                console.error('Error loading file:', error);
                setValue('无法加载文件内容');
            } finally {
                setIsLoading(false);
            }
        };
        
        loadContent();
    }, [activeKey, filePath, loadFileContent]);

    // 防抖保存到状态（不实际保存到文件，只是更新缓存）
    const updateFile = useCallback(
        debounce((v) => {
            if (activeKey && filePath) {
                updateFileContent(filePath, v);
            }
        }, 500),
        [activeKey, filePath, updateFileContent]
    );

    // 保存文件到磁盘
    const handleSave = useCallback(() => {
        if (!activeKey || !filePath || !value) {
            message.warning('没有可保存的内容');
            return;
        }
        
        setIsSaving(true);
        saveFileContent(filePath, value)
            .then(success => {
                if (success) {
                    message.success('文件保存成功');
                }
            })
            .catch(error => {
                console.error('Save error:', error);
                message.error('保存失败');
            })
            .finally(() => {
                setIsSaving(false);
            });
    }, [activeKey, filePath, value, saveFileContent]);

    // 处理内容变化
    const handleChange = (v) => {
        setValue(v);
        updateFile(v);
    };

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="editor-toolbar">
                <div className="file-info">
                    {filePath && (
                        <span className="file-path">
                            {filePath.startsWith('new-file-') ? '新文件' : filePath}
                        </span>
                    )}
                </div>
                <Button 
                    type="primary" 
                    onClick={handleSave} 
                    loading={isSaving}
                    disabled={!activeKey || isLoading}
                    className="save-btn"
                    color="cyan"
                    variant='solid'
                >
                    保存
                </Button>
            </div>
            
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {isLoading ? (
                    <div className="loading-container">
                        <p>加载中...</p>
                    </div>
                ) : (
                    <Editor
                        mode='split'
                        locale={zh}
                        value={value}
                        plugins={plugins}
                        onChange={handleChange}
                    />
                )}
            </div>
        </div>
    );
}

export default TextEditor;