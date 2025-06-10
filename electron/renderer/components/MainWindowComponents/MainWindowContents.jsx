import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import React, { useState, useRef, useEffect } from "react";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { Table,Spin,Typography,Input, Button, message } from "antd";
import ReactMarkdown from 'react-markdown';
import LeftBar from "./LeftBar/LeftBar";
import Doclist from "../../templates/Doclist/Doclist";
import TabsBar from "./TabsBar/TabsBar";
import TextEditor from "./TextEditor/TextEditor";
import Conversation from "./Conversation/Conversation";
import Search from "./Search/Search";
import ChunkInfo from "./ChunkInfo/ChunkInfo";
import Welcome from "./Welcome/Welcome";
import "./MainWindowContents.css";

export default function MainWindowContents() {
    //overall state management
    const [content, setContent] = useState('welcome');
    //search state management
    const [inputValue, setInputValue] = useState('');
    const [showResult, setShowResult] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isTimeout, setIsTimeout] = useState(false);
    const [searchResult, setSearchResult] = useState([]);
    const [selectedResultIndex, setSelectedResultIndex] = useState(null);
    const [lastClickTime, setLastClickTime] = useState(0);

    // conversation state management
    const [history, setHistory] = useState([]);
    const [inputQuestionValue, setInputQuestionValue] = useState('');
    const [streaming, setStreaming] = useState([]);
    const [convLoading, setConvLoading] = useState(false);
    const [stopped, setStopped] = useState(false);
    const streamingRef = useRef([]);

    // information state management
    const [showInfo, setShowInfo] = useState(false);
    const [info, setInfo] = useState([]);

    // tabsbar and doclist state management
    const [selectNode, setSelectNode] = useState(null);
    const [tabs, setTabs] = useState([])
    const [activeKey, setActiveKey] = useState('')
    const [fileContentMap, setFileContentMap] = useState({}); // 存储文件内容
    const [treeData, setTreeData] = useState([]); // 存储文件树数据

    //information related
    const handleInfoClick = async () => {
        setShowInfo(!showInfo);
        let usage = await window.getApiUsage();
        setInfo(usage);
    };

    // 创建系统标签的通用函数
    const createSystemTab = (tabType, tabLabel) => {
        const tabKey = `system-${tabType}`;
        
        // 检查是否已存在相同标签
        const exists = tabs.some(tab => tab.key === tabKey);
        
        if (!exists) {
            // 添加新的系统标签
            setTabs(prev => [
                ...prev,
                {
                    key: tabKey,
                    label: tabLabel,
                    isLeaf: false, // 系统标签不是文件
                    isSystem: true, // 标记为系统标签
                    systemType: tabType, // 系统类型
                    filePath: null
                }
            ]);
        }
        
        // 激活该标签
        setActiveKey(tabKey);
    };

    // 修改 LeftBar 的处理函数
    const handleConversation = () => {
        setContent('conversation');
        createSystemTab('conversation', '对话');
    };

    const handleSearch = () => {
        setContent('search');
        createSystemTab('search', '搜索');
    };

    const handleEdit = () => {
        setContent('edit');
        // 如果有文件标签，切换到最后一个文件标签
        const fileTab = tabs.filter(tab => !tab.isSystem).pop();
        if (fileTab) {
            setActiveKey(fileTab.key);
        } else {
            // 如果没有文件标签，创建一个新文件
            handleNewTab();
        }
    };

    const handleChunkInfo = () => {
        setContent('chunkInfo');
        createSystemTab('chunkInfo', '分块信息');
    };

    // 处理文件选择 - 当文件树中选择文件时调用
    const handleFileSelect = (node) => {
        if (!node || !node.key) return;

        setSelectNode(node);

        // 只有当节点是文件（叶子节点）时才创建标签页
        if (node.isLeaf) {
            // 检查是否已存在相同标签
            const exists = tabs.some(tab => tab.key === node.key);

            if (!exists) {
                // 添加新标签
                setTabs(prev => [
                    ...prev,
                    {
                        key: node.key,
                        label: node.title,
                        isLeaf: node.isLeaf,
                        isSystem: false, // 文件标签不是系统标签
                        filePath: node.filePath || node.key,
                        node: node // 存储完整的节点对象
                    }
                ]);
            }

            // 激活该标签
            setActiveKey(node.key);
            setContent('edit'); // 切换到编辑模式
        } else {
            // 对于文件夹节点，只更新选中状态但不创建标签页
            // 可以在这里添加文件夹特定的处理逻辑（如果需要）
        }
    };

    // 处理标签切换 - 根据标签类型切换内容
    const handleTabChange = (key) => {
        setActiveKey(key);
        
        // 找到对应的标签
        const tab = tabs.find(t => t.key === key);
        if (tab) {
            if (tab.isSystem) {
                // 系统标签：根据系统类型切换内容
                setContent(tab.systemType);
                
                // 如果是文件相关的系统标签，清除文件选择
                if (tab.systemType !== 'edit') {
                    setSelectNode(null);
                }
            } else {
                // 文件标签：切换到编辑模式并选中对应文件
                setContent('edit');
                if (tab.node) {
                    setSelectNode(tab.node);
                }
            }
        }
    };

    // 处理标签关闭
    const handleTabEdit = (targetKey) => {
        const newTabs = tabs.filter(tab => tab.key !== targetKey);
        setTabs(newTabs);

        // 清除关闭标签的文件内容缓存（仅对文件标签）
        const closedTab = tabs.find(tab => tab.key === targetKey);
        if (closedTab && !closedTab.isSystem) {
            setFileContentMap(prev => {
                const newMap = { ...prev };
                delete newMap[targetKey];
                return newMap;
            });
        }

        if (targetKey === activeKey) {
            if (newTabs.length > 0) {
                // 切换到最后一个标签
                const lastTab = newTabs[newTabs.length - 1];
                setActiveKey(lastTab.key);
                
                if (lastTab.isSystem) {
                    setContent(lastTab.systemType);
                } else {
                    setContent('edit');
                    if (lastTab.node) {
                        setSelectNode(lastTab.node);
                    }
                }
            } else {
                // 没有标签时，返回默认状态
                setActiveKey('');
                setContent('welcome');
                setSelectNode(null);
            }
        }
    };

    // 加载文件内容
    const loadFileContent = async (filePath) => {
        if (!filePath) return '';

        // 如果已经有缓存，直接返回
        if (fileContentMap[filePath]) {
            return fileContentMap[filePath];
        }

        try {
            const content = await window.electronAPI.getFile(filePath);
            setFileContentMap(prev => ({
                ...prev,
                [filePath]: content
            }));
            return content;
        } catch (error) {
            console.error('Error loading file:', error);
            return '无法加载文件内容';
        }
    };

    // 更新文件内容
    const updateFileContent = (filePath, content) => {
        setFileContentMap(prev => ({
            ...prev,
            [filePath]: content
        }));
    };

    // 保存文件内容
    const saveFileContent = async (filePath, content) => {
        try {
            await window.electronAPI.updateFile(filePath, content);
            updateFileContent(filePath, content);
            message.success('文件保存成功');
            return true;
        } catch (error) {
            console.error('Error saving file:', error);
            message.error('文件保存失败');
            return false;
        }
    };

    // 创建新标签
    const handleNewTab = () => {
        const newTabKey = `new-file-${Date.now()}`;
        const newTab = {
            key: newTabKey,
            label: '新文件',
            isLeaf: true,
            isSystem: false, // 新文件不是系统标签
            filePath: newTabKey
        };

        setTabs(prev => [...prev, newTab]);
        setActiveKey(newTabKey);
        setContent('edit');

        // 初始化新文件内容
        setFileContentMap(prev => ({
            ...prev,
            [newTabKey]: '# 新文件\n\n在这里开始编写您的内容...'
        }));
    };

    // search related - 修改搜索功能
    const handleOnChange = (event) => setInputValue(event.target.value);

    const handleSearchClick = async () => {
        if (!inputValue.trim() || isLoading) return; // 防止重复搜索

        setShowResult(true);
        setIsLoading(true);
        setIsTimeout(false);
        setSearchResult([]);

        try {
            let result = await window.search(inputValue, true);
            setSearchResult(result);
        } catch (error) {
            console.error('Search error:', error);
            if (error && error.message && error.message.includes('timeout')) {
                setIsTimeout(true);
            }
            setSearchResult([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = async (e) => {
        if (e.key === 'Enter' && !isLoading) { // 防止重复搜索
            await handleSearchClick();
        }
    };

    const [lineRange, setLineRange] = useState(null);
    // 强制刷新行高亮的辅助函数
    const refreshLineHighlight = (range) => {
        // 先清空状态，然后重新设置，强制触发更新
        setLineRange(null);
        // 使用setTimeout确保状态更新后再设置新值
        setTimeout(() => {
            setLineRange(range);
        }, 50);
    };

    // 跟踪当前文件是否在加载中
    const [fileLoading, setFileLoading] = useState(false);

    // 更新 jumpToFile 函数 - 简化行高亮处理流程
    const jumpToFile = async (filePath, beginLine, endLine) => {
        try {
            filePath = await window.electronAPI.pathJoin(window.repoPath, filePath);
            // 检查参数有效性
            if (!filePath) return;

            console.log(`正在跳转到文件: ${filePath}, 行范围: ${beginLine}-${endLine}`);

            // 查找文件对应的节点（通过路径匹配）
            let fileNode = findNodeByPath(treeData, filePath);

            if (!fileNode) {
                // 如果在树中找不到节点，创建一个临时节点
                fileNode = {
                    key: filePath,
                    title: filePath.split('/').pop(), // 从路径中提取文件名
                    filePath: filePath,
                    isLeaf: true
                };
            }

            // 检查文件是否已经在标签页中打开
            const existingTab = tabs.find(tab => tab.filePath === filePath);
            let targetKey;

            if (existingTab) {
                // 如果标签已存在，激活它
                targetKey = existingTab.key;
            } else {
                // 添加新标签
                const newTab = {
                    key: fileNode.key || `file-${Date.now()}`,
                    label: fileNode.title || filePath.split('/').pop(),
                    isLeaf: true,
                    isSystem: false,
                    filePath: filePath,
                    node: fileNode
                };

                targetKey = newTab.key;
                setTabs(prev => [...prev, newTab]);
            }

            // 首先进行内容加载，确保文件内容可用
            let fileContent = fileContentMap[filePath];
            if (!fileContent) {
                try {
                    console.log('预加载文件内容');
                    fileContent = await loadFileContent(filePath);
                } catch (error) {
                    console.error('预加载文件内容失败:', error);
                }
            }

            // 切换到编辑模式，激活标签
            setContent('edit');
            setActiveKey(targetKey);

            // 设置行范围，一次性设置，避免重复触发
            if (beginLine || endLine) {
                const range = {
                    start: parseInt(beginLine, 10) || 1,
                    end: parseInt(endLine, 10) || parseInt(beginLine, 10) || 1
                };

                // 设置行范围后立即清空，只触发一次传递
                setLineRange(range);
            }
        } catch (error) {
            console.error('跳转文件时出错:', error);
        }
    };

    // 递归查找文件节点的辅助函数
    const findNodeByPath = (nodes, path) => {
        if (!nodes || !Array.isArray(nodes)) return null;

        for (const node of nodes) {
            // 检查当前节点
            if (node.filePath === path) {
                return node;
            }

            // 如果有子节点，递归查找
            if (node.children) {
                const found = findNodeByPath(node.children, path);
                if (found) return found;
            }
        }

        return null;
    };

    // conversation related - 修复对话逐字输出和分块显示
    const handleSendConversation = () => {
        if (convLoading) return;
        if (!inputQuestionValue.trim()) return;

        setConvLoading(true);
        setStopped(false);
        setStreaming([]);
        streamingRef.current = [];

        // 添加新的对话项到历史
        const newHistoryItem = {
            query: inputQuestionValue,
            retrieval: [],
            answer: '',
            time: Date.now(),
            pending: true
        };

        setHistory(prev => [...prev, newHistoryItem]);

        const handleSearch = (e) => {
            console.log('Search event:', e.detail);
            streamingRef.current.push({ type: 'search', content: e.detail });
            setStreaming([...streamingRef.current]);
        };

        const handleAnnotation = (e) => {
            console.log('Annotation event:', e.detail);
            streamingRef.current.push({ type: 'annotation', content: e.detail });
            setStreaming([...streamingRef.current]);
        };

        const handleResult = (e) => {
            console.log('Result event:', e.detail);
            streamingRef.current.push({ type: 'result', content: e.detail });
            setStreaming([...streamingRef.current]);
        };

        const handleAnswer = (e) => {
            console.log('Answer event:', e.detail);
            streamingRef.current.push({ type: 'answer', content: e.detail });
            setStreaming([...streamingRef.current]);
        };

        const handleDoneRetrieval = (e) => {
            console.log('Done retrieval event:', e.detail);
            // 检索完成，但对话可能还在继续
        };

        const handleDone = (e) => {
            console.log('Done event:', e.detail);

            // 解析流式数据为最终历史记录
            const finalHistory = parseStreamingToHistory(inputQuestionValue, streamingRef.current);

            setHistory(prev => {
                const newHistory = [...prev];
                const pendingIndex = newHistory.findIndex(item => item.pending);
                if (pendingIndex !== -1) {
                    newHistory[pendingIndex] = { ...finalHistory, pending: false };
                }
                return newHistory;
            });

            // 清理状态
            setStreaming([]);
            streamingRef.current = [];
            setConvLoading(false);

            // 移除事件监听器
            cleanup();
        };

        const cleanup = () => {
            window.removeEventListener('conversationSearch', handleSearch);
            window.removeEventListener('conversationAnnotation', handleAnnotation);
            window.removeEventListener('conversationResult', handleResult);
            window.removeEventListener('conversationAnswer', handleAnswer);
            window.removeEventListener('conversationDoneRetrieval', handleDoneRetrieval);
            window.removeEventListener('conversationDone', handleDone);
        };

        // 注册事件监听器
        window.addEventListener('conversationSearch', handleSearch);
        window.addEventListener('conversationAnnotation', handleAnnotation);
        window.addEventListener('conversationResult', handleResult);
        window.addEventListener('conversationAnswer', handleAnswer);
        window.addEventListener('conversationDoneRetrieval', handleDoneRetrieval);
        window.addEventListener('conversationDone', handleDone);

        // 开始对话
        window.beginConversation('deepseek', inputQuestionValue);
        setInputQuestionValue('');
    };

    //stop conversation
    const handleStop = () => {
        setStopped(true);
        setConvLoading(false);
        if (window.stopConversation) window.stopConversation();
    };

    //press enter to retrieve
    const handleConvKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendConversation();
        }
    };

    // 修复解析流式数据的函数
    function parseStreamingToHistory(query, streaming) {
        let retrieval = [];
        let answer = '';
        let currentRetrieval = null;

        streaming.forEach(msg => {
            switch (msg.type) {
                case 'annotation':
                    // 如果有未完成的检索，先保存
                    if (currentRetrieval) {
                        retrieval.push(currentRetrieval);
                    }
                    // 开始新的检索
                    currentRetrieval = {
                        annotation: msg.content,
                        search: [],
                        result: []
                    };
                    break;

                case 'search':
                    if (currentRetrieval) {
                        currentRetrieval.search.push(msg.content);
                    }
                    break;

                case 'result':
                    if (currentRetrieval) {
                        currentRetrieval.result.push(msg.content);
                    }
                    break;

                case 'answer':
                    // 逐字累积答案
                    answer += msg.content;
                    break;
            }
        });

        // 保存最后一个检索
        if (currentRetrieval) {
            retrieval.push(currentRetrieval);
        }

        return {
            query,
            retrieval,
            answer,
            time: Date.now()
        };
    }

    //render the search result with markdown and highlight
    const resultItem0 = searchResult.map((item, index) => (
        <li key={index}
            className={`result0-item ${selectedResultIndex === index ? 'selected' : ''}`}
            onClick={() => {
                setSelectedResultIndex(index);
            }}
            onDoubleClick={() => {
                jumpToFile(item.filePath, item.beginLine, item.endLine);
            }}>
            <div className='result0-item-container'>
                <div className='chunkcontent-container'>
                    <div className='chunkcontent-content'>
                        {item.highlightedContent ? (
                            <div dangerouslySetInnerHTML={{ __html: item.highlightedContent }} />
                        ) : (
                            <ReactMarkdown>{item.content || ''}</ReactMarkdown>
                        )}
                    </div>
                </div>
                <div className='filepath-container'>
                    <div className='filepath-content'>{item.filePath}</div>
                </div>
            </div>
        </li>
    ));

    //conversation input
    const onChange_Conv = (e) => setInputQuestionValue(e.target.value);
    const onPressEnter_Conv = handleConvKeyDown;
    const onClick_Conv = handleSendConversation;

    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <LeftBar
                handleConversation={handleConversation}
                handleSearch={handleSearch}
                handleEdit={handleEdit}
                handleChunkInfo={handleChunkInfo}
            />
            <div style={{ flex: 1, display: 'flex' }}>
                <PanelGroup direction="horizontal" autoSaveId="main-window-horizontal">
                    <Panel
                        minSize={8}
                        maxSize={40}
                        defaultSize={20}
                        className='mainwindow-panel_1'>
                        <div className='topbar-tools'>

                        </div>
                        <Doclist
                            setSelectNode={handleFileSelect}
                            selectNode={selectNode}
                            treeData={treeData}
                            setTreeData={setTreeData}
                        ></Doclist>
                    </Panel>
                    <PanelResizeHandle className='main-panel-resize-handle'></PanelResizeHandle>
                    <Panel
                        // minSize={60}
                        // maxSize={90}
                        // defaultSize={70}
                        className='mainwindow-panel_2'>
                        <div className='biaoqian'>
                            <div className="tabsbar-container">
                                <TabsBar
                                    tabs={tabs}
                                    activeKey={activeKey}
                                    onTabEdit={handleTabEdit}
                                    onTabChange={handleTabChange}
                                    onNewTab={handleNewTab}
                                />
                            </div>
                            <div className="control-space"></div>
                        </div>
                        <MainDemo
                            className='maindemo'
                            // search related
                            content={content}
                            inputValue={inputValue}
                            isLoading={isLoading}
                            resultItem={resultItem0}
                            showResult={showResult}
                            isTimeout={isTimeout}
                            onChange={handleOnChange}
                            onKeyDown={handleKeyPress}
                            onSearchClick={handleSearchClick}
                            lineRange={lineRange}
                            jumpToFile={jumpToFile}
                            // conversation related
                            history={history}
                            streaming={streaming}
                            inputQuestionValue={inputQuestionValue}
                            setInputQuestionValue={setInputQuestionValue}
                            onSendConversation={handleSendConversation}
                            onConvKeyDown={handleConvKeyDown}
                            convLoading={convLoading}
                            onChange_Conv={onChange_Conv}
                            onPressEnter_Conv={onPressEnter_Conv}
                            onClick_Conv={onClick_Conv}
                            stopped={stopped}
                            onStop={handleStop}
                            //information related
                            handleInfoClick={handleInfoClick}
                            info={info}
                            showInfo={showInfo}
                            // edit related
                            activeKey={activeKey}
                            tabs={tabs}
                            fileContentMap={fileContentMap}
                            loadFileContent={loadFileContent}
                            updateFileContent={updateFileContent}
                            saveFileContent={saveFileContent}
                            setLineRange={setLineRange}
                        />
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
}

// MainDemo 组件保持不变，只是处理 edit 模式时需要检查系统标签
const MainDemo = ({
    content, inputValue, resultItem, onChange, onKeyDown, onSearchClick, isLoading, showResult, isTimeout, className,
    history, streaming, inputQuestionValue, setInputQuestionValue, onSendConversation, onConvKeyDown, convLoading,
    onChange_Conv, onPressEnter_Conv, onClick_Conv, stopped, onStop, handleInfoClick, showInfo, info,
    activeKey, tabs, fileContentMap, loadFileContent, updateFileContent, saveFileContent, lineRange, jumpToFile, setLineRange
}) => {
    switch (content) {
        case 'conversation':
            return (
                <Conversation
                    className={className}
                    history={history}
                    streaming={streaming}
                    inputQuestionValue={inputQuestionValue}
                    onSendConversation={onSendConversation}
                    onConvKeyDown={onConvKeyDown}
                    convLoading={convLoading}
                    onChange_Conv={onChange_Conv}
                    onPressEnter_Conv={onPressEnter_Conv}
                    onClick_Conv={onClick_Conv}
                    stopped={stopped}
                    onStop={onStop}
                    handleInfoClick={handleInfoClick}
                    showInfo={showInfo}
                    info={info}>
                </Conversation>
            );
        case 'search':
            return (
                <Search
                    className={className}
                    inputValue={inputValue}
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                    onSearchClick={onSearchClick}
                    isLoading={isLoading}
                    isTimeout={isTimeout}
                    showResult={showResult}
                    resultItem={resultItem}
                />
            )
        case 'edit':
            return (
                <TextEditor
                    className={className}
                    activeKey={activeKey}
                    tabs={tabs}
                    fileContentMap={fileContentMap}
                    loadFileContent={loadFileContent}
                    updateFileContent={updateFileContent}
                    saveFileContent={saveFileContent}
                    lineRange={lineRange}
                    onHighlightComplete={() => { setLineRange(null);}}
                >
                </TextEditor>
            );
        case 'chunkInfo':
            return (
                <ChunkInfo className = {className}>
                </ChunkInfo>    
            );
        case 'welcome':
        default:
            return (
                <Welcome className = {className}>
                </Welcome>
            );
    }
};