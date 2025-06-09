import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button, message } from 'antd';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import emoji from '@bytemd/plugin-gemoji';
import breaks from '@bytemd/plugin-breaks';
import math from '@bytemd/plugin-math'
import { Editor } from '@bytemd/react';
import 'juejin-markdown-themes/dist/juejin.css';
import 'bytemd/dist/index.css';
import zh from 'bytemd/locales/zh_Hans.json';
import 'highlight.js/styles/github-dark.css';
import debounce from 'lodash/debounce';
import './TextEditor.css';
import { LoadingOutlined } from '@ant-design/icons';

const mathPlugin = math({
    // 指定使用 KaTeX (默认) 或 MathJax
    katex: {
        // katex 配置选项
        throwOnError: false,
        output: 'mathtml' // 或者 'mathml'
    }
});

// 配置 highlight 插件以减少抖动
const highlightPlugin = highlight({
    // 只高亮常用语言，减少处理量
    languages: ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp',
        'css', 'html', 'markdown', 'json', 'bash', 'shell', 'sql', 'xml'],
    // 增加延迟，防止频繁重新渲染
    init: (hljs) => {
        // 原始的高亮方法
        const originalHighlightBlock = hljs.highlightBlock;

        // 包装高亮方法，添加节流
        hljs.highlightBlock = function (block) {
            // 使用 setTimeout 延迟高亮以减少抖动
            setTimeout(() => {
                originalHighlightBlock.call(hljs, block);
            }, 10);
        };

        return hljs;
    },
    // 引入样式时减少自动重新计算
    detect: true // 自动检测语言
});

// 修复：移除参数中重复的 filePath 和 content，只保留需要的参数
function TextEditor({ 
    tabs, 
    fileContentMap, 
    className, 
    activeKey, 
    loadFileContent, 
    updateFileContent, 
    saveFileContent 
}) {
    const plugins = [ 
        mathPlugin,
        breaks(),
        gfm(),
        emoji(),
        highlightPlugin
    ];

    // 检查当前活动标签是否为文件标签
    const activeTab = tabs.find(tab => tab.key === activeKey);

    // 如果是系统标签，显示提示信息
    if (activeTab && activeTab.isSystem) {
        return (
            <div className={className} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div className="maindemo-content" style={{ flex: 1, minHeight: 0, width: "100%", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', color: '#999' }}>
                        <div style={{ fontSize: '18px', marginBottom: '12px' }}>请选择一个文件进行编辑</div>
                        <div style={{ fontSize: '14px' }}>或点击「+」按钮创建新文件</div>
                    </div>
                </div>
            </div>
        );
    }

    // 文件标签的正常处理 - 现在可以正常声明这些变量
    const currentFilePath = activeTab?.filePath || activeKey;
    const currentContent = fileContentMap[currentFilePath] || '';

    const [value, setValue] = useState(currentContent || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    // 使用 ref 跟踪是否已经初始化过
    const isInitializedRef = useRef(false);
    const currentFilePathRef = useRef(currentFilePath);

    useEffect(() => {
        setIsLoading(true);

        // 只有在文件路径真正改变时才重新加载
        if (currentFilePathRef.current !== currentFilePath) {
            currentFilePathRef.current = currentFilePath;
            isInitializedRef.current = false;
        }

        if (!activeKey || !currentFilePath) {
            setValue('');
            setIsLoading(false);
            return;
        }
        
        // 使用 setTimeout 确保加载图标至少显示一段时间
        const timer = setTimeout(() => {
            // 如果已经初始化过当前文件，只显示加载图标后隐藏
            if (isInitializedRef.current) {
                setIsLoading(false);
                return;
            }

            const loadContent = async () => {
                try {
                    const fileContent = await loadFileContent(currentFilePath);
                    setValue(fileContent);
                    isInitializedRef.current = true;
                } catch (error) {
                    console.error('Error loading file:', error);
                    setValue('无法加载文件内容');
                    isInitializedRef.current = true;
                } finally {
                    setIsLoading(false);
                }
            };

            loadContent();
        }, 100);

        return () => clearTimeout(timer);
    }, [activeKey, currentFilePath, loadFileContent]);

    const handleSave = useCallback(() => {
        if (!activeKey || !currentFilePath || !value) {
            return;
        }
        
        saveFileContent(currentFilePath, value)
            .then(success => {
                if (success) {
                    // message.success('文件保存成功');
                }
                // 不重新加载文件内容，保持当前编辑状态
            })
            .catch(error => {
                console.error('Save error:', error);
                message.error('保存失败');
            })
            .finally(() => {
                setIsSaving(false);
            });
    }, [activeKey, currentFilePath, value, saveFileContent]);

    const handleChange = useCallback((v) => {
        setValue(v);
        // updateFile(v); // 保持注释状态
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave]);

    return (
        <div className={className} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="maindemo-content" style={{ flex: 1, minHeight: 0, width: "100%"}}>
                <div className="dark-editor-container">
                    <div className="editor-content">
                        {isLoading ? (
                            <div className="loading-container dark-loading"
                                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#00b0b0'}}>
                                <LoadingOutlined style={{ fontSize: 32 }} spin />
                            </div>
                        ) : (
                            <Editor
                                mode="auto"
                                locale={zh}
                                value={value}
                                plugins={plugins}
                                onChange={handleChange}
                                editorConfig={{
                                        lineNumbers: true,
                                        lineWrapping: true,
                                        theme: 'default',
                                        tabSize: 4,
                                        styleActiveLine: true
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TextEditor;