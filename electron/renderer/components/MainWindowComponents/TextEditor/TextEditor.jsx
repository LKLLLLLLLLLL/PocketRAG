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
import { set } from 'lodash';

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

function TextEditor({ activeKey, filePath, content, loadFileContent, updateFileContent, saveFileContent }) {
    const plugins = [ 
        mathPlugin,
        breaks(),
        gfm(),
        emoji(),
        highlightPlugin
    ];
    const [value, setValue] = useState(content || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    // 使用 ref 跟踪是否已经初始化过
    const isInitializedRef = useRef(false);
    const currentFilePathRef = useRef(filePath);

    useEffect(() => {
        setIsLoading(true);

        // 只有在文件路径真正改变时才重新加载
        if (currentFilePathRef.current !== filePath) {
            currentFilePathRef.current = filePath;
            isInitializedRef.current = false;
        }

        if (!activeKey || !filePath) {
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
                    const fileContent = await loadFileContent(filePath);
                    setValue(fileContent);
                    isInitializedRef.current = true; // 标记为已初始化
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
    }, [activeKey, filePath]); // 移除 loadFileContent 依赖

    const handleSave = useCallback(() => {
        if (!activeKey || !filePath || !value) {
            // message.warning('没有可保存的内容');
            return;
        }
        
        // setIsSaving(true);
        saveFileContent(filePath, value)
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
    }, [activeKey, filePath, value, saveFileContent]);

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
    );
}

export default TextEditor;