import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import React, { useState, useRef, useEffect } from "react";
import { useCallback } from 'react';
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { Table, Spin, Typography, Input, Button, message } from "antd";
import ReactMarkdown from 'react-markdown';
import LeftBar from "./LeftBar/LeftBar";
import Doclist from "./Doclist/Doclist";
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

    // 新增：对话相关状态
    const [selectedConversationId, setSelectedConversationId] = useState(null);
    const [selectedModel, setSelectedModel] = useState(null);
    // 添加缺失的状态
    const [currentConversationTopic, setCurrentConversationTopic] = useState('新对话');
    const [conversationList, setConversationList] = useState([]);

    // information state management
    const [showInfo, setShowInfo] = useState(false);
    const [info, setInfo] = useState([]);

    // tabsbar and doclist state management
    const [selectNode, setSelectNode] = useState(null);
    const [tabs, setTabs] = useState([])
    const [activeKey, setActiveKey] = useState('')
    const [fileContentMap, setFileContentMap] = useState({}); // 存储文件内容
    const [treeData, setTreeData] = useState([]); // 存储文件树数据

    // 在状态管理部分添加
    const [embeddingStatus, setEmbeddingStatus] = useState({}); // 嵌入状态管理
    const [showEmbeddingTable, setShowEmbeddingTable] = useState(false); // 控制表格显示

    // 修改 useEffect 中的初始化顺序
    useEffect(() => {
        const initializeConversations = async () => {
            try {
                console.log('Starting conversation initialization...')

                // 1. 等待仓库初始化完成
                await window.repoInitializePromise;

                // 2. 初始化对话映射
                await window.initConversationMap();

                // 3. 加载模型设置并自动选择第一个模型
                await initializeModel();

                // 4. 加载对话列表
                await loadConversationList();

            } catch (err) {
                console.error('Failed to initialize conversations:', err);
            }
        };

        initializeConversations();
    }, []); // 移除依赖，避免循环

    // 新增初始化模型的函数
    const initializeModel = async () => {
        try {
            const settings = await window.electronAPI.getSettings()
            const generationModels = settings.conversationSettings?.generationModel || [];

            if (generationModels.length > 0 && !selectedModel) {
                setSelectedModel(generationModels[0].name);
            }
        } catch (err) {
            console.error('Failed to initialize model:', err);
        }
    };

    // 修改 loadConversationList 函数，不使用 getAllConversations

    const loadConversationList = useCallback(async () => {
        try {
            console.log('Loading conversation list...');

            if (!window.conversations || window.conversations.size === 0) {
                console.log('No conversations found in map');
                setConversationList([]);
                return;
            }

            const conversations = [];

            for (const [conversationId, conversationPath] of window.conversations.entries()) {
                try {
                    const historyData = await window.electronAPI.getFile(conversationPath);
                    const history = JSON.parse(historyData);
                    conversations.push({
                        conversationId: conversationId, // 保持原始类型，不强制转换为数字
                        topic: history.topic || `对话 ${conversationId}`,
                        lastTime: history.history?.length > 0
                            ? history.history[history.history.length - 1].time
                            : (typeof conversationId === 'number' ? conversationId : Date.now())
                    });
                } catch (err) {
                    console.error(`Failed to read conversation ${conversationId}:`, err);
                    conversations.push({
                        conversationId: conversationId,
                        topic: `新对话 ${conversationId}`,
                        lastTime: typeof conversationId === 'number' ? conversationId : Date.now()
                    });
                }
            }

            console.log('Loaded conversation list:', conversations);
            setConversationList(conversations.sort((a, b) => b.lastTime - a.lastTime));
        } catch (err) {
            console.error('Failed to load conversation list:', err);
            setConversationList([]);
        }
    }, []);

    // 在 useEffect 中修改事件处理，支持进度值
    useEffect(() => {
        const handleEmbeddingProgress = (event) => {
            const { filePath, status, progress } = event.detail;
            console.log('收到嵌入进度:', filePath, status, '进度:', progress);

            setEmbeddingStatus(prev => ({
                ...prev,
                [filePath]: {
                    status: status,
                    progress: progress || null, // 保存原始进度值
                    timestamp: Date.now() // 可选：添加时间戳
                }
            }));

            // 有嵌入活动时显示表格
            setShowEmbeddingTable(true);
        };

        // 添加对话事件监听
        const handleSearch = (e) => {
            setStreaming(prev => [...prev, { type: 'search', content: e.detail, time: Date.now() }]);
            streamingRef.current.push({ type: 'search', content: e.detail, time: Date.now() });
        };

        const handleAnnotation = (e) => {
            setStreaming(prev => [...prev, { type: 'annotation', content: e.detail, time: Date.now() }]);
            streamingRef.current.push({ type: 'annotation', content: e.detail, time: Date.now() });
        };

        const handleResult = (e) => {
            setStreaming(prev => [...prev, { type: 'result', content: e.detail, time: Date.now() }]);
            streamingRef.current.push({ type: 'result', content: e.detail, time: Date.now() });
        };

        const handleAnswer = (e) => {
            setStreaming(prev => [...prev, { type: 'answer', content: e.detail, time: Date.now() }]);
            streamingRef.current.push({ type: 'answer', content: e.detail, time: Date.now() });
        };

        const handleDoneRetrieval = (e) => {
            console.log('检索完成:', e.detail);
        };

        const handleDone = (e) => {
            console.log('对话完成:', e.detail);

            // 解析流式数据
            const finalHistory = parseStreamingToHistory(inputQuestionValue, streamingRef.current);

            // 更新历史记录
            setHistory(prev => {
                const newHistory = [...prev];
                const pendingIndex = newHistory.findIndex(item => item.pending);
                if (pendingIndex !== -1) {
                    newHistory[pendingIndex] = { ...finalHistory, pending: false };
                }
                return newHistory;
            });

            // 清理状态
            setConvLoading(false);
            setStopped(false);
            setStreaming([]);
            streamingRef.current = [];
        };

        // 添加事件监听器
        window.addEventListener('conversationSearch', handleSearch);
        window.addEventListener('conversationAnnotation', handleAnnotation);
        window.addEventListener('conversationResult', handleResult);
        window.addEventListener('conversationAnswer', handleAnswer);
        window.addEventListener('conversationDoneRetrieval', handleDoneRetrieval);
        window.addEventListener('conversationDone', handleDone);

        window.addEventListener('embedding', handleEmbeddingProgress);

        return () => {
            window.removeEventListener('embedding', handleEmbeddingProgress); // 清理事件监听器
            window.removeEventListener('conversationSearch', handleSearch);
            window.removeEventListener('conversationAnnotation', handleAnnotation);
            window.removeEventListener('conversationResult', handleResult);
            window.removeEventListener('conversationAnswer', handleAnswer);
            window.removeEventListener('conversationDoneRetrieval', handleDoneRetrieval);
            window.removeEventListener('conversationDone', handleDone);
        };
    }, [inputQuestionValue]);

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

    // 修改 handleSelectConversation 函数

    const handleSelectConversation = async (conversationId) => {
        console.log('Selecting conversation:', conversationId);

        setSelectedConversationId(conversationId);

        try {
            // 通过 window.conversations Map 获取文件路径
            const conversationPath = window.conversations.get(conversationId);
            if (!conversationPath) {
                console.log('No path found for conversation:', conversationId);
                setCurrentConversationTopic('新对话');
                setHistory([]);
                return;
            }

            console.log('Loading conversation from path:', conversationPath);

            // 使用 window.electronAPI.getFile 获取内容
            const historyData = await window.electronAPI.getFile(conversationPath);
            const conversationData = JSON.parse(historyData);

            console.log('Loaded conversation data:', conversationData);

            // 根据你提供的数据结构正确设置标题和历史记录
            setCurrentConversationTopic(conversationData.topic || '新对话');
            setHistory(conversationData.history || []);

            console.log('Set topic:', conversationData.topic);
            console.log('Set history length:', conversationData.history?.length || 0);

        } catch (err) {
            console.error('Failed to load conversation:', err);
            setCurrentConversationTopic('新对话');
            setHistory([]);
        }

        // 清理当前的流式状态
        setStreaming([]);
        streamingRef.current = [];
        setConvLoading(false);
        setStopped(false);
    };

    // 在原有代码基础上，修复handleNewConversation函数

    // 处理新建对话 - 修复异步调用问题
    const handleNewConversation = async () => {
        const newConversationId = Date.now();
        setSelectedConversationId(newConversationId);
        setCurrentConversationTopic('新对话');
        setHistory([]);
        setStreaming([]);
        streamingRef.current = [];
        setConvLoading(false);
        setStopped(false);

        try {
            const conversationPath = await window.electronAPI.pathJoin(
                window.repoPath,
                '.PocketRAG',
                'conversation',
                `conversation-${newConversationId}.json`
            );
            window.conversations.set(newConversationId, conversationPath);
            console.log('Created new conversation:', newConversationId);

            // 立即将新对话加入 conversationList
            setConversationList(prev => ([
                {
                    conversationId: newConversationId,
                    topic: '新对话',
                    lastTime: newConversationId
                },
                ...prev
            ]));
        } catch (err) {
            console.error('Failed to create conversation path:', err);
        }
    };

    // 处理模型选择
    const handleModelSelect = async (modelName) => {
        setSelectedModel(modelName);
        // 获取模型详细信息并存入 info
        try {
            const settings = await window.electronAPI.getSettings();
            const generationModels = settings.conversationSettings?.generationModel || [];
            const modelInfo = generationModels.find(m => m.name === modelName);
            if (modelInfo) setInfo([modelInfo]);
        } catch (err) {
            setInfo([]);
        }
    };

    // 优化后的发送逻辑
    const handleSendConversation = async () => {
        if (convLoading || !inputQuestionValue.trim() || !selectedModel) {
            if (!selectedModel) message.error('请先选择对话模型');
            return;
        }

        setConvLoading(true);
        setStopped(false);
        setStreaming([]);
        streamingRef.current = [];

        // 使用当前的对话ID（如果存在）或让 beginConversation 创建新的
        const conversationId = selectedConversationId || undefined;

        // 添加待处理的对话项
        const newHistoryItem = {
            query: inputQuestionValue,
            retrieval: [],
            answer: '',
            time: Date.now(),
            pending: true
        };
        setHistory(prev => [...prev, newHistoryItem]);

        try {
            // 调用 beginConversation，如果没有ID会自动创建
            const returnedId = await window.beginConversation(
                selectedModel,
                inputQuestionValue,
                conversationId
            );

            // 如果是新对话，更新ID
            if (!selectedConversationId) {
                setSelectedConversationId(returnedId);
                setCurrentConversationTopic('新对话');
            }

        } catch (err) {
            console.error('Failed to start conversation:', err);
            setConvLoading(false);
        }

        setInputQuestionValue('');
    };

    //stop conversation
    const handleStop = async () => {
        setStopped(true);
        setConvLoading(false);
        if (selectedConversationId && window.stopConversation) {
            await window.stopConversation(selectedConversationId);
        }
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
                            embeddingStatus={embeddingStatus} // 传递嵌入状态
                            showEmbeddingTable={showEmbeddingTable} // 传递表格显示状态
                            onToggleEmbeddingTable={() => setShowEmbeddingTable(!showEmbeddingTable)} // 切换表格显示
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
                            // 新增props
                            selectedConversationId={selectedConversationId}
                            onSelectConversation={handleSelectConversation}
                            onNewConversation={handleNewConversation}
                            selectedModel={selectedModel}
                            onModelSelect={handleModelSelect}
                            conversationList={conversationList}
                            loadConversationList={loadConversationList}
                            currentConversationTopic={currentConversationTopic} // 关键
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
    activeKey, tabs, fileContentMap, loadFileContent, updateFileContent, saveFileContent, lineRange, jumpToFile, setLineRange,
    // 新增的对话相关props
    selectedConversationId, onSelectConversation, onNewConversation, selectedModel, onModelSelect,
    currentConversationTopic, conversationList, loadConversationList
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
                    info={info}
                    // 新增props
                    selectedConversationId={selectedConversationId}
                    onSelectConversation={onSelectConversation}
                    onNewConversation={onNewConversation}
                    selectedModel={selectedModel}
                    onModelSelect={onModelSelect}
                    currentConversationTopic={currentConversationTopic}
                    conversationList={conversationList}
                    loadConversationList={loadConversationList}
                />
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
                    onHighlightComplete={() => { setLineRange(null); }}
                >
                </TextEditor>
            );
        case 'chunkInfo':
            return (
                <ChunkInfo className={className}>
                </ChunkInfo>
            );
        case 'welcome':
        default:
            return (
                <Welcome className={className}>
                </Welcome>
            );
    }
};