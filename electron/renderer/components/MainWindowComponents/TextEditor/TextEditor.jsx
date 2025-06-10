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
    saveFileContent,
    lineRange = null,
    onHighlightComplete = null
}) {
    const plugins = [
        mathPlugin,
        breaks(),
        gfm(),
        emoji(),
        highlightPlugin
    ];

    // 添加一个 ref 用于获取编辑器实例
    const editorRef = useRef(null);
    const codeMirrorRef = useRef(null);
    const highlightTimeoutRef = useRef(null);

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
    const loadedFilesRef = useRef({});

        // 使用ref跟踪已执行的高亮，避免重复高亮
        const highlightedRangeRef = useRef(null);
        const pendingHighlightTimeoutsRef = useRef([]);

    // 简化的CodeMirror实例获取方法
    const getCodeMirrorInstance = useCallback(() => {
        // 方法1: 通过cached ref
        if (codeMirrorRef.current) {
            return codeMirrorRef.current;
        }

        // 方法2: 通过DOM查找
        const editorElement = document.querySelector('.bytemd .CodeMirror');
        if (editorElement && editorElement.CodeMirror) {
            codeMirrorRef.current = editorElement.CodeMirror;
            return editorElement.CodeMirror;
        }

        // 方法3: 通过editorRef
        if (editorRef.current && editorRef.current.getCodeMirror) {
            try {
                const cm = editorRef.current.getCodeMirror();
                if (cm) {
                    codeMirrorRef.current = cm;
                    return cm;
                }
            } catch (e) {
                console.warn('getCodeMirror方法调用失败:', e);
            }
        }

        return null;
    }, []);

    // 高亮指定行的函数
    const highlightLines = useCallback((startLine, endLine) => {
        const cm = getCodeMirrorInstance();
        if (!cm) {
            console.warn('无法获取CodeMirror实例进行高亮');
            return;
        }

        try {
            // 确保行号从0开始
            const targetStartLine = Math.max(0, parseInt(startLine, 10) - 1);
            const targetEndLine = endLine ? Math.max(0, parseInt(endLine, 10) - 1) : targetStartLine;

            // 确保行号有效
            const lineCount = cm.lineCount();
            if (targetStartLine >= lineCount) {
                console.warn(`目标起始行 ${targetStartLine} 超出文件范围 (总行数: ${lineCount})`);
                return;
            }

            console.log(`开始高亮行: ${targetStartLine + 1}-${Math.min(targetEndLine + 1, lineCount)}`);

            // 先移除所有现有高亮和过渡类
            for (let i = 0; i < lineCount; i++) {
                cm.removeLineClass(i, 'background', 'line-highlight');
                cm.removeLineClass(i, 'background', 'line-highlight-fadeout');
            }

            // 设置光标位置并滚动到目标行
            cm.setCursor(targetStartLine, 0);
            cm.scrollIntoView({ line: targetStartLine, ch: 0 }, 200);

            // 添加高亮样式
            const actualEndLine = Math.min(targetEndLine, lineCount - 1);
            for (let i = targetStartLine; i <= actualEndLine; i++) {
                cm.addLineClass(i, 'background', 'line-highlight');
            }

            // 确保高亮样式已添加
            addHighlightStyles();

            console.log(`成功高亮行: ${targetStartLine + 1}-${actualEndLine + 1}`);

            // 清除之前的定时器
            if (highlightTimeoutRef.current) {
                clearTimeout(highlightTimeoutRef.current);
            }

            // 2秒后添加淡出效果
            highlightTimeoutRef.current = setTimeout(() => {
                // 为所有高亮行添加淡出效果
                for (let i = targetStartLine; i <= actualEndLine; i++) {
                    try {
                        // 保留原有高亮，添加淡出类
                        cm.addLineClass(i, 'background', 'line-highlight-fadeout');
                    } catch (e) {
                        // 忽略可能的错误
                    }
                }

                // 高亮完全结束后，通知父组件清除lineRange
                if (typeof onHighlightComplete === 'function') {
                    console.log('高亮动画完成，通知父组件清除lineRange');
                    onHighlightComplete();
                }

                // // 动画结束后(1.5秒)完全移除高亮
                // setTimeout(() => {
                //     for (let i = targetStartLine; i <= actualEndLine; i++) {
                //         try {
                //             cm.removeLineClass(i, 'background', 'line-highlight');
                //             cm.removeLineClass(i, 'background', 'line-highlight-fadeout');
                //         } catch (e) {
                //             // 忽略可能的错误（编辑器可能已被销毁）
                //         }
                //         // 高亮完全结束后，通知父组件清除lineRange
                //         if (typeof onHighlightComplete === 'function') {
                //             console.log('高亮动画完成，通知父组件清除lineRange');
                //             onHighlightComplete();
                //         }
                //     }
                // }, 1500); // 渐变动画持续时间
            }, 1000); // 保持高亮的时间

        } catch (error) {
            console.error('高亮行时出错:', error);
        }
    }, [getCodeMirrorInstance]);

    // 添加高亮样式到页面
    const addHighlightStyles = useCallback(() => {
        const styleId = 'text-editor-highlight-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
            .CodeMirror-linebackground.line-highlight {
                background-color: rgba(255, 255, 0, 0.25) !important;
                transition: background-color 1.5s ease; /* 添加过渡属性 */
            }
            .line-highlight {
                background-color: rgba(255, 255, 0, 0.25) !important;
                transition: background-color 1.5s ease; /* 添加过渡属性 */
            }
            .CodeMirror-linebackground.line-highlight-fadeout {
                animation: highlight-fade 1.5s forwards !important;
                background-color: transparent !important; /* 确保最终状态 */
            }
            @keyframes highlight-fade {
                0% { background-color: rgba(255, 255, 0, 0.25); }
                100% { background-color: transparent; }
            }
        `;
            document.head.appendChild(style);
            console.log('已添加高亮样式到页面');
        }
    }, []);

    useEffect(() => {
        if (loadedFilesRef.current[currentFilePath] && fileContentMap[currentFilePath]) {
            setValue(fileContentMap[currentFilePath]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // 只有在文件路径真正改变时才重新加载
        if (currentFilePathRef.current !== currentFilePath) {
            currentFilePathRef.current = currentFilePath;
            isInitializedRef.current = false;
            // 清除CodeMirror缓存
            codeMirrorRef.current = null;
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

    // 监听lineRange变化，执行行高亮
    useEffect(() => {
        if (!lineRange || isLoading) return;

        console.log('收到行范围参数:', lineRange);

        // 延迟执行高亮，确保编辑器已完全加载
        const executeHighlight = () => {
            

            if (typeof lineRange === 'object' && lineRange.start && lineRange.end) {
                highlightLines(lineRange.start, lineRange.end);
            } else if (typeof lineRange === 'number' || typeof lineRange === 'string') {
                highlightLines(lineRange, lineRange);
            }
        };

        // 多次尝试执行高亮，因为CodeMirror实例可能需要时间初始化
        const timeouts = [500, 1000, 1500, 2000];
        timeouts.forEach(delay => {
            setTimeout(executeHighlight, delay);
        });

        // 清理函数
        return () => {
            if (highlightTimeoutRef.current) {
                clearTimeout(highlightTimeoutRef.current);
                highlightTimeoutRef.current = null;
            }
        };
    }, [lineRange, isLoading, highlightLines]);

    // 编辑器挂载后的处理
    const handleEditorMount = useCallback(() => {
        console.log('编辑器挂载，尝试获取CodeMirror实例');

        // 延迟获取CodeMirror实例，给ByteMD时间初始化
        const attemptGetInstance = (attempt = 1) => {
            const cm = getCodeMirrorInstance();
            if (cm) {
                console.log(`成功获取CodeMirror实例 (第${attempt}次尝试)`);
                // 如果有待处理的行高亮，执行它
                if (lineRange) {
                    if (typeof lineRange === 'object' && lineRange.start && lineRange.end) {
                        highlightLines(lineRange.start, lineRange.end);
                    } else if (typeof lineRange === 'number' || typeof lineRange === 'string') {
                        highlightLines(lineRange, lineRange);
                    }
                }
            } else if (attempt < 20) { // 最多尝试20次，总共约4秒
                setTimeout(() => attemptGetInstance(attempt + 1), 200);
            } else {
                console.warn('无法获取CodeMirror实例，已达到最大尝试次数');
            }
        };

        attemptGetInstance();
    }, [getCodeMirrorInstance, highlightLines, lineRange]);

    // 监听DOM变化来检测编辑器是否已加载
    useEffect(() => {
        if (isLoading) return;

        const checkForEditor = () => {
            const editorElement = document.querySelector('.bytemd .CodeMirror');
            if (editorElement) {
                handleEditorMount();
            } else {
                // 继续检查
                setTimeout(checkForEditor, 100);
            }
        };

        // 延迟开始检查，给编辑器时间渲染
        const timer = setTimeout(checkForEditor, 300);

        return () => clearTimeout(timer);
    }, [isLoading, handleEditorMount]);

    // 清理effect
    useEffect(() => {
        return () => {
            // 清理高亮timeout
            if (highlightTimeoutRef.current) {
                clearTimeout(highlightTimeoutRef.current);
                highlightTimeoutRef.current = null;
            }
            // 重置CodeMirror缓存
            codeMirrorRef.current = null;
        };
    }, [activeKey]);

    return (
        <div className={className} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="maindemo-content" style={{ flex: 1, minHeight: 0, width: "100%" }}>
                <div className="dark-editor-container">
                    <div className="editor-content">
                        {isLoading ? (
                            <div className="loading-container dark-loading"
                                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#00b0b0' }}>
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
                                    styleActiveLine: true,
                                }}
                                ref={editorRef}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default React.memo(TextEditor, (prevProps, nextProps) => {
    // 修复比较函数中的语法错误，使用 && 而非逗号
    const sameActiveKey = prevProps.activeKey === nextProps.activeKey;
    const sameContent = prevProps.fileContentMap[prevProps.activeKey] === nextProps.fileContentMap[nextProps.activeKey];
    // const sameLineRange = JSON.stringify(prevProps.lineRange) === JSON.stringify(nextProps.lineRange);

    return sameActiveKey && sameContent;
});