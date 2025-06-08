import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import React, { useState, useRef, useEffect } from "react";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { Table,Spin,Typography,Input, Button, message } from "antd";
import ReactMarkdown from 'react-markdown';
import Doclist from "../../templates/Doclist/Doclist";
import LeftBar from "./LeftBar/LeftBar";
import TextEditor from "./TextEditor";
import TabsBar from "./TabsBar";
import "./MainWindowContents.css";

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

export default function MainWindowContents() {
    //overall state management
    const [content, setContent] = useState('conversation');
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

    // 添加文件树自动刷新功能
    useEffect(() => {
        const fetchTreeData = () => {
            const repoPath = window.repoPath;
            if (!repoPath) return;
            window.electronAPI.getRepoFileTree(repoPath).then((data) => {
                setTreeData(data);
            });
        };

        // 初始加载文件树
        fetchTreeData();

        // 设置定时刷新
        const refreshInterval = setInterval(fetchTreeData, 60000); // 每60秒刷新一次

        // 监听文件变化事件
        window.electronAPI.onRepoFileChanged(fetchTreeData);

        return () => {
            clearInterval(refreshInterval);
            // window.electronAPI.removeRepoFileChangedListener(fetchTreeData);
        };
    }, []);

    //information related
    const handleInfoClick = async () => {
        setShowInfo(!showInfo);
        let usage = await window.getApiUsage();
        setInfo(usage);
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

    // 处理标签切换 - 同步到文件树
    const handleTabChange = (key) => {
        setActiveKey(key);
        setContent('edit'); // 切换到编辑模式

        // 找到标签对应的节点并选中
        const tab = tabs.find(t => t.key === key);
        if (tab && tab.node) {
            setSelectNode(tab.node);
        }
    };

    // 处理标签关闭
    const handleTabEdit = (targetKey) => {
        const newTabs = tabs.filter(tab => tab.key !== targetKey);
        setTabs(newTabs);

        // 清除关闭标签的文件内容缓存
        setFileContentMap(prev => {
            const newMap = { ...prev };
            delete newMap[targetKey];
            return newMap;
        });

        if (targetKey === activeKey) {
            setActiveKey(newTabs.length > 0 ? newTabs[0].key : '');
            setContent(newTabs.length > 0 ? 'edit' : content);
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
            onClick={() => setSelectedResultIndex(index)}>
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
                handleConversation={() => setContent('conversation')}
                handleSearch={() => setContent('search')}
                handleEdit={() => setContent('edit')}
                handleChunkInfo={() => setContent('chunkInfo')}
            />
            <div style={{ flex: 1, display: 'flex' }}>
                <PanelGroup direction="horizontal" autoSaveId="main-window-horizontal">
                    <Panel
                        minSize={10}
                        maxSize={40}
                        defaultSize={30}
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
                        minSize={60}
                        maxSize={90}
                        defaultSize={70}
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
                        />
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
}

const MainDemo = ({
    content, inputValue, resultItem, onChange, onKeyDown, onSearchClick, isLoading, showResult, isTimeout, className,
    history, streaming, inputQuestionValue, setInputQuestionValue, onSendConversation, onConvKeyDown, convLoading,
    onChange_Conv, onPressEnter_Conv, onClick_Conv, stopped, onStop, handleInfoClick, showInfo, info,
    activeKey, tabs, fileContentMap, loadFileContent, updateFileContent, saveFileContent
}) => {
    switch (content) {
        case 'conversation':
            return (
                <div className={className}>
                    <div className='maindemo-content'>
                        <PanelGroup direction="vertical" className='conversation-panelgroup'>
                            <Panel minSize={50} maxSize={80} defaultSize={70} className='conversation-panel_1'>
                                <div className='conversation-container' style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', marginTop: 24 }}>
                                    <div className="chat-history" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                        {history.map((item, idx) => (
                                            <div key={idx} className="chat-history-item" style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div className="chat-row chat-row-question">
                                                    <div className="chat-bubble chat-bubble-question">{item.query}</div>
                                                </div>
                                                {item.pending && idx === history.length - 1 ? (
                                                    stopped ? (
                                                        <div className="chat-row chat-row-answer">
                                                            <div className="chat-bubble chat-bubble-answer chat-loading" style={{ color: '#ff4d4f' }}>
                                                                对话已停止
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {/* 显示检索过程 */}
                                                            {streaming.reduce((acc, msg) => {
                                                                if (msg.type === 'annotation') {
                                                                    acc.push({ annotation: msg.content, search: [], result: [] });
                                                                } else if (msg.type === 'search') {
                                                                    if (acc.length === 0) acc.push({ annotation: '', search: [], result: [] });
                                                                    acc[acc.length - 1].search.push(msg.content);
                                                                } else if (msg.type === 'result') {
                                                                    if (acc.length === 0) acc.push({ annotation: '', search: [], result: [] });
                                                                    acc[acc.length - 1].result.push(msg.content);
                                                                }
                                                                return acc;
                                                            }, []).map((retr, i) => (
                                                                <React.Fragment key={`streaming-${i}`}>
                                                                    {retr.annotation && (
                                                                        <div className="annotation-container">
                                                                            检索目的：{retr.annotation}
                                                                        </div>
                                                                    )}
                                                                    {retr.search.length > 0 && (
                                                                        <div className="searchkey-container">
                                                                            关键词：{retr.search.join('、')}
                                                                        </div>
                                                                    )}
                                                                    {retr.result.length > 0 && (
                                                                        <div className="conversation-result-list">
                                                                            {retr.result.map((res, j) => (
                                                                                <div key={`result-${i}-${j}`} className="result0-item">
                                                                                    <div className="result0-item-container">
                                                                                        <div className="chunkcontent-container">
                                                                                            <div className="chunkcontent-content">
                                                                                                {res.highlightedContent ? (
                                                                                                    <div dangerouslySetInnerHTML={{ __html: res.highlightedContent }} />
                                                                                                ) : (
                                                                                                    <ReactMarkdown>{res.content || res}</ReactMarkdown>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                        {res.filePath && (
                                                                                            <div className="filepath-container">
                                                                                                <div className="filepath-content">
                                                                                                    {res.filePath} {res.beginLine && res.endLine ? `[${res.beginLine}-${res.endLine}]` : ''}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </React.Fragment>
                                                            ))}

                                                            {/* 显示实时答案 */}
                                                            {streaming.some(msg => msg.type === 'answer') && (
                                                                <div className="chat-row chat-row-answer">
                                                                    <div className="chat-bubble chat-bubble-answer">
                                                                        <ReactMarkdown>
                                                                            {streaming
                                                                                .filter(msg => msg.type === 'answer')
                                                                                .map(msg => msg.content)
                                                                                .join('')}
                                                                        </ReactMarkdown>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* 显示加载状态 */}
                                                            {!streaming.some(msg => msg.type === 'answer') && (
                                                                <div className="chat-row chat-row-answer">
                                                                    <div className="chat-bubble chat-bubble-answer chat-loading">
                                                                        <LoadingOutlined /> 正在生成回答...
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )
                                                ) : (
                                                    <>
                                                        {/* 显示完成的检索结果 */}
                                                        {item.retrieval?.map((retr, i) => (
                                                            <React.Fragment key={i}>
                                                                <div className="annotation-container">
                                                                    检索目的：{retr.annotation}
                                                                </div>
                                                                <div className="searchkey-container">
                                                                    关键词：{Array.isArray(retr.search) ? retr.search.join('、') : retr.search}
                                                                </div>
                                                                <div className="conversation-result-list">
                                                                    {retr.result.map((res, j) => (
                                                                        <div key={j} className="result0-item">
                                                                            <div className="result0-item-container">
                                                                                <div className="chunkcontent-container">
                                                                                    <div className="chunkcontent-content">
                                                                                        {res.highlightedContent ? (
                                                                                            <div dangerouslySetInnerHTML={{ __html: res.highlightedContent }} />
                                                                                        ) : (
                                                                                            <ReactMarkdown>{res.content || res}</ReactMarkdown>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                {res.filePath && (
                                                                                    <div className="filepath-container">
                                                                                        <div className="filepath-content">
                                                                                            {res.filePath} {res.beginLine && res.endLine ? `[${res.beginLine}-${res.endLine}]` : ''}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </React.Fragment>
                                                        ))}
                                                        {/* 显示完成的答案 */}
                                                        <div className="chat-row chat-row-answer">
                                                            <div className="chat-bubble chat-bubble-answer">
                                                                <ReactMarkdown>{item.answer}</ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Panel>
                            <PanelResizeHandle className='conversation-panel-resize-handle' />
                            <Panel minSize={20} maxSize={50} defaultSize={30} className='conversation-panel_2'>
                                {showInfo && Array.isArray(info) && info.length > 0 && typeof info[0] === 'object' && (
                                    <div className="model-info-panel">
                                        <table>
                                            <tbody>
                                                {Object.entries(info[0]).map(([key, value]) => (
                                                    <tr key={key}>
                                                        <td>{key}</td>
                                                        <td>{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <div className='question-input'>
                                    <div className='input-area'>
                                        <TextArea
                                            placeholder='请输入问题'
                                            rows={5}
                                            className='conversation-question-input'
                                            onChange={onChange_Conv}
                                            onPressEnter={onPressEnter_Conv}
                                            value={inputQuestionValue}
                                            disabled={convLoading}
                                            style={{ fontSize: 16, padding: '12px', minHeight: 48, maxHeight: 120 }}
                                            showCount="true"
                                        />
                                    </div>
                                    <div className='button-area'>
                                        <div className="model-information-area">
                                            <Button
                                                className="model-information-button"
                                                onClick={handleInfoClick}
                                                color="cyan"
                                                variant='solid'
                                            >
                                                {showInfo ? '关闭' : '信息'}
                                            </Button>
                                        </div>
                                        <div className="conversation-control-area">
                                            <Button
                                                onClick={convLoading ? onStop : onClick_Conv}
                                                disabled={convLoading ? false : !inputQuestionValue.trim()}
                                                className={convLoading ? 'stop-button' : 'send-button'}
                                                style={{
                                                    height: 48,
                                                    fontSize: 16,
                                                    marginLeft: 12
                                                }}
                                                color={convLoading ? '#00aaaa' : 'cyan'}
                                                variant='solid'>
                                                {convLoading ? '停止' : '发送'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </Panel>
                        </PanelGroup>
                    </div>
                </div>
            );
        case 'search':
            return (
                <div style={{ flexDirection: 'column' }} className={className}>
                    <div className='maindemo-content'>
                        <div className='searchinput-container'>
                            <Input.Search
                                type='text'
                                placeholder='请输入内容，按回车或点击搜索'
                                className='searchinput'
                                value={inputValue}
                                onChange={onChange}
                                onKeyDown={onKeyDown}
                                onSearch={onSearchClick}
                                enterButton
                                size="large"
                                loading={isLoading}
                                disabled={isLoading}
                            />
                        </div>
                        <div className='searchresult-container'>
                            <div className='explanation-container'>
                                <div className="explanation">
                                    {isTimeout ? <div>请求超时</div>
                                        : isLoading ? <div><LoadingOutlined /> 搜索中...</div>
                                            : showResult ? <div>结果如下</div>
                                                : <div>请进行搜索</div>}
                                </div>
                            </div>
                            <div className='result-ul-container'>
                                {!isLoading && showResult &&
                                    <ul className='result-ul'>
                                        {resultItem.length > 0 ? resultItem : <li>未找到结果</li>}
                                    </ul>
                                }
                            </div>
                        </div>
                    </div>
                </div>
            );
        case 'edit':
            const activeTab = tabs.find(tab => tab.key === activeKey);
            const filePath = activeTab?.filePath || activeKey;
            const fileContent = fileContentMap[filePath] || '';

            return (
                <div className={className} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div className="maindemo-content" style={{ flex: 1, minHeight: 0}}>
                        <TextEditor
                            activeKey={activeKey}
                            filePath={filePath}
                            content={fileContent}
                            loadFileContent={loadFileContent}
                            updateFileContent={updateFileContent}
                            saveFileContent={saveFileContent}
                        />
                    </div>
                </div>
            );
        case 'chunkInfo':
            return (
                <div className={className} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div className="maindemo-content" style={{ width: "100%",flex: 1, minHeight: 0}}>
                        <ChunkInfo />
                    </div>
                </div>
            );
        default:
            return (
                <div className={className}>
                    <div className='maindemo-content'>
                        <h2>Welcome</h2>
                        <p>Select a feature from the left bar.</p>
                    </div>
                </div>
            );
    }
};

const ChunkInfo = () => {
    const [chunkInfo, setChunkInfo] = useState([]);
    const [loading, setLoading] = useState(true);

    // 获取分块信息
    useEffect(() => {
        const fetchChunkInfo = async () => {
            try {
                setLoading(true);
                // 直接调用window.getChunksInfo方法
                const result = await window.getChunksInfo();
                setChunkInfo(result || []);
            } catch (error) {
                console.error("获取分块信息出错:", error);
                setChunkInfo([]);
            } finally {
                setLoading(false);
            }
        };

        fetchChunkInfo();
    }, []);

    const columns = [
        {
            title: '分块ID',
            dataIndex: 'chunkId',
            key: 'chunkId',
            width: 120,
            fixed: 'left',
            render: (text) => (
                <Text
                    code
                    style={{ color: '#00b0b0' }}
                >
                    {text}
                </Text>
            ),
        },
        {
            title: '文件路径',
            dataIndex: 'filePath',
            key: 'filePath',
            width: 250,
            render: (text, record) => (
                <Paragraph
                    ellipsis={{
                        rows: 1,
                        expandable: true,
                        symbol: (expanded) => {
                            console.log('文件路径展开状态:', expanded); // 调试用
                            return expanded ? '收起' : '展开';
                        },
                        onExpand: (expanded) => handleExpand(`filePath-${record.key}`, expanded),
                    }}
                    style={{
                        color: '#ffe066',
                        margin: 0,
                        fontSize: '12px',
                    }}
                    title={text}
                >
                    {text}
                </Paragraph>
            ),
        },
        {
            title: '行号范围',
            key: 'lineRange',
            width: 100,
            render: (_, record) => (
                <Text style={{ color: '#999' }}>
                    {record.beginLine !== undefined && record.endLine !== undefined
                        ? `${record.beginLine}-${record.endLine}`
                        : record.beginLine !== undefined || record.endLine !== undefined
                        ? record.beginLine || record.endLine
                        : '-'
                    }
                </Text>
            ),
        },
        {
            title: '嵌入模型',
            dataIndex: 'embeddingName',
            key: 'embeddingName',
            width: 120,
            render: (text) => (
                <Text style={{ color: '#87ceeb' }}>
                    {text || '-'}
                </Text>
            ),
        },
        {
            title: '分块内容',
            dataIndex: 'content',
            key: 'content',
            width: 400,
            render: (text) => (
                <Paragraph
                    ellipsis={{
                        rows: 3,
                        expandable: true,
                        symbol: (expanded) => expanded ? '收起' : '展开', // 修改：使用函数形式
                    }}
                    style={{
                        color: '#fff',
                        margin: 0,
                        lineHeight: '1.4',
                        fontSize: '13px',
                    }}
                >
                    {text || '无内容'}
                </Paragraph>
            ),
        },
        {
            title: '元数据',
            dataIndex: 'metadata',
            key: 'metadata',
            width: 200,
            render: (metadata) => {
                if (!metadata) {
                    return <Text style={{ color: '#999' }}>无元数据</Text>;
                }

                // 如果metadata是对象，转换为JSON字符串
                const metadataStr = typeof metadata === 'object' 
                    ? JSON.stringify(metadata, null, 2)
                    : String(metadata);

                return (
                    <Paragraph
                        ellipsis={{
                            rows: 2,
                            expandable: true,
                            symbol: (expanded) => expanded ? '收起' : '展开', // 修改：使用函数形式
                        }}
                        style={{
                            color: '#ddd',
                            margin: 0,
                            fontSize: '12px',
                            fontFamily: 'monospace',
                        }}
                    >
                        {metadataStr}
                    </Paragraph>
                );
            },
        },
    ];

    // 为表格数据添加key
    const dataSource = chunkInfo.map((item, index) => ({
        ...item,
        key: item.chunkId || index,
    }));

    if (loading) {
        return (
            <div
                className="chunkinfo-container"
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    flexDirection: 'column',
                }}
            >
                <LoadingOutlined style={{ fontSize: 32, color: '#00b0b0' }} />
                <div style={{ color: '#ccc', marginTop: 16 }}>
                    正在加载分块信息...
                </div>
            </div>
        );
    }

    if (!chunkInfo || chunkInfo.length === 0) {
        return (
            <div
                className="chunkinfo-container"
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    flexDirection: 'column',
                }}
            >
                <div style={{ color: '#999', fontSize: '16px' }}>
                    暂无分块信息
                </div>
                <div style={{ color: '#666', fontSize: '14px', marginTop: 8 }}>
                    请确保已经进行了文档索引
                </div>
            </div>
        );
    }

    return (
        <div
            className="chunkinfo-container"
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #555',
                    backgroundColor: '#222',
                }}
            >
                <Text
                    style={{
                        color: '#999', // 标题改为灰色
                        fontSize: '16px',
                        fontWeight: 'bold'
                    }}
                >
                    分块信息总览
                </Text>
                <Text
                    style={{
                        color: '#999',
                        fontSize: '14px',
                        marginLeft: 12
                    }}
                >
                    共 {chunkInfo.length} 个分块
                </Text>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', backgroundColor: "#222" }}>
                <Table
                    columns={columns}
                    dataSource={dataSource}
                    scroll={{
                        x: 1200,
                        y: 'calc(100vh - 200px)',
                    }}
                    pagination={{
                        pageSize: 50,
                        showSizeChanger: true,
                        showQuickJumper: true,
                        showTotal: (total, range) =>
                            `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                        pageSizeOptions: ['20', '50', '100', '200'],
                    }}
                    size="small"
                    bordered
                    style={{
                        height: '100%',
                    }}
                    className="chunk-info-table"
                />
            </div>
        </div>
    );
};