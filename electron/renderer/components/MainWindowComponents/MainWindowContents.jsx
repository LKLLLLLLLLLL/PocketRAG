import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import React, { useState, useRef, useEffect } from "react";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { Input, Button, message } from "antd";
import ReactMarkdown from 'react-markdown';
import Doclist from "../../templates/Doclist/Doclist";
import LeftBar from "./LeftBar/LeftBar";
import TextEditor from "./TextEditor";
import TabsBar from "./TabsBar";
import "./MainWindowContents.css";

const { TextArea } = Input;

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
        const refreshInterval = setInterval(fetchTreeData, 5000); // 每5秒刷新一次

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

    // search related
    const handleOnChange = (event) => setInputValue(event.target.value);

    const handleKeyPress = async (e) => {
        if (e.key === 'Enter') {
            setShowResult(true);
            setIsLoading(true);
            setIsTimeout(false);
            try {
                let result = await window.search(inputValue, true);
                setSearchResult(result);
            } catch (error) {
                if (error && error.message && error.message.includes('timeout')) {
                    setIsTimeout(true);
                }
            } finally {
                setIsLoading(false);
            }
        }
    };

    // conversation related
    const handleSendConversation = () => {
        if (convLoading) return;
        if (!inputQuestionValue.trim()) return;
        setConvLoading(true);
        setStopped(false);
        setStreaming([]);
        streamingRef.current = [];

        setHistory(his => [
            ...his,
            {
                query: inputQuestionValue,
                retrieval: [],
                answer: '',
                time: Date.now(),
                pending: true
            }
        ]);

        const handleSearch = (e) => {
            streamingRef.current.push({ type: 'search', content: e.detail });
            setStreaming([...streamingRef.current]);
        };
        const handleAnnotation = (e) => {
            streamingRef.current.push({ type: 'annotation', content: e.detail });
            setStreaming([...streamingRef.current]);
        };
        const handleResult = (e) => {
            streamingRef.current.push({ type: 'result', content: e.detail });
            setStreaming([...streamingRef.current]);
        };
        const handleAnswer = (e) => {
            streamingRef.current.push({ type: 'answer', content: e.detail });
            setStreaming([...streamingRef.current]);
        };
        const handleDone = () => {
            const newHistory = parseStreamingToHistory(inputQuestionValue, streamingRef.current);
            setHistory(his => {
                const idx = his.findIndex(item => item.pending);
                if (idx !== -1) {
                    const updated = [...his];
                    updated[idx] = { ...newHistory, pending: false };
                    return updated;
                }
                return [...his, newHistory];
            });
            setStreaming([]);
            streamingRef.current = [];
            setConvLoading(false);

            window.removeEventListener('conversationSearch', handleSearch);
            window.removeEventListener('conversationAnnotation', handleAnnotation);
            window.removeEventListener('conversationResult', handleResult);
            window.removeEventListener('conversationAnswer', handleAnswer);
            window.removeEventListener('conversationDone', handleDone);
        };

        window.addEventListener('conversationSearch', handleSearch);
        window.addEventListener('conversationAnnotation', handleAnnotation);
        window.addEventListener('conversationResult', handleResult);
        window.addEventListener('conversationAnswer', handleAnswer);
        window.addEventListener('conversationDone', handleDone);

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

    function parseStreamingToHistory(query, streaming) {
        let retrieval = [];
        let answer = '';
        let curRetr = null;
        streaming.forEach(msg => {
            if (msg.type === 'annotation') {
                if (curRetr) retrieval.push(curRetr);
                curRetr = { annotation: msg.content, search: [], result: [] };
            } else if (msg.type === 'search') {
                if (curRetr) curRetr.search.push(msg.content);
            } else if (msg.type === 'result') {
                if (curRetr) curRetr.result.push(msg.content);
            } else if (msg.type === 'answer') {
                answer += msg.content;
            }
        });
        if (curRetr) retrieval.push(curRetr);
        return {
            query,
            retrieval,
            answer,
            time: Date.now()
        };
    }

    //render the search result 
    const resultItem0 = searchResult.map((item, index) => (
        <li key={index}
            className={`result0-item ${selectedResultIndex === index ? 'selected' : ''}`}
            onClick={() => setSelectedResultIndex(index)}>
            <div className='result0-item-container'>
                <div className='chunkcontent-container'>
                    <div className='chunkcontent-explanation'>分块内容</div>
                    <div className='chunkcontent-content'>
                        <span dangerouslySetInnerHTML={{ __html: item.highlightedContent }} />
                    </div>
                </div>
                <div className='filepath-container'>
                    <div className='filepath-explanation'>文件路径</div>
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
                    <PanelResizeHandle className = 'main-panel-resize-handle'></PanelResizeHandle>
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
                            <div className = "control-space"></div>
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
    content, inputValue, resultItem, onChange, onKeyDown, isLoading, showResult, isTimeout, className,
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
                                                                检索已停止
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
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
                                                                <React.Fragment key={i}>
                                                                    <div className="annotation-container">
                                                                        检索目的：{retr.annotation}
                                                                    </div>
                                                                    <div className="searchkey-container">
                                                                        关键词：{retr.search.join('、')}
                                                                    </div>
                                                                    <div className="conversation-result-list">
                                                                        {retr.result.map((res, j) => (
                                                                            <div key={j} className="conversation-result">
                                                                                <div className="conversation-result-container">
                                                                                    <div className="chunkcontent-container">
                                                                                        <div className="chunkcontent-explanation">分块内容</div>
                                                                                        <div className="chunkcontent-content">
                                                                                            <span dangerouslySetInnerHTML={{ __html: res.highlightedContent || res.content || res }} />
                                                                                        </div>
                                                                                    </div>
                                                                                    {res.filePath &&
                                                                                        <div className="filepath-container">
                                                                                            <div className="filepath-explanation">文件路径</div>
                                                                                            <div className="filepath-content">
                                                                                                {res.filePath} {res.beginLine && res.endLine ? `[${res.beginLine}-${res.endLine}]` : ''}
                                                                                            </div>
                                                                                        </div>
                                                                                    }
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </React.Fragment>
                                                            ))}
                                                            <div className="chat-row chat-row-answer">
                                                                <div className="chat-bubble chat-bubble-answer chat-loading">正在检索...</div>
                                                            </div>
                                                        </>
                                                    )
                                                ) : (
                                                    item.retrieval?.map((retr, i) => (
                                                        <React.Fragment key={i}>
                                                            <div className="annotation-container">
                                                                检索目的：{retr.annotation}
                                                            </div>
                                                            <div className="searchkey-container">
                                                                关键词：{Array.isArray(retr.search) ? retr.search.join('、') : retr.search}
                                                            </div>
                                                            <div className="conversation-result-list">
                                                                {retr.result.map((res, j) => (
                                                                    <div key={j} className="conversation-result">
                                                                        <div className="conversation-result-container">
                                                                            <div className="chunkcontent-container">
                                                                                <div className="chunkcontent-explanation">分块内容</div>
                                                                                <div className="chunkcontent-content">
                                                                                    <span dangerouslySetInnerHTML={{ __html: res.highlightedContent || res.content || res }} />
                                                                                </div>
                                                                            </div>
                                                                            {res.filePath &&
                                                                                <div className="filepath-container">
                                                                                    <div className="filepath-explanation">文件路径</div>
                                                                                    <div className="filepath-content">
                                                                                        {res.filePath} {res.beginLine && res.endLine ? `[${res.beginLine}-${res.endLine}]` : ''}
                                                                                    </div>
                                                                                </div>
                                                                            }
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </React.Fragment>
                                                    ))
                                                )}
                                                {!item.pending &&
                                                    <div className="chat-row chat-row-answer">
                                                        <div className="chat-bubble chat-bubble-answer">
                                                            <ReactMarkdown>{item.answer}</ReactMarkdown>
                                                        </div>
                                                    </div>
                                                }
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Panel>
                            <PanelResizeHandle className = 'conversation-panel-resize-handle'/>
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
                                                color = "cyan"
                                                variant = 'solid'
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
                                                color = {convLoading ? '#00aaaa' : 'cyan'}
                                                variant = 'solid'>
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
                            <Input.Search type='text'
                                placeholder='请输入内容，按回车以继续'
                                className='searchinput'
                                value={inputValue}
                                onChange={onChange}
                                onKeyDown={onKeyDown}
                                color = "cyan"
                                variant="filled">
                            </Input.Search>
                        </div>
                        <div className='searchresult-container'>
                            <div className='explanation-container'>
                                <div className="explanation">
                                    {isTimeout ? <div>请求超时</div>
                                        : isLoading ? <div><LoadingOutlined /></div>
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
                    <div className="maindemo-content" style={{ flex: 1, minHeight: 0 }}>
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