import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import React, { useState, useRef } from "react";
import { Input, Button } from "antd";
import Doclist from "../../templates/Doclist/Doclist";
import LeftBar from "./LeftBar/LeftBar";
import "./MainWindowContents.css";
import RepoFileTree from "./RepoFileTree";

const { TextArea } = Input;

export default function MainWindowContents() {
    //overall state management
    const [content, setContent] = useState('');// recognize the content of the main window, either 'conversation' or 'search'
    
    //search state management
    const [inputValue, setInputValue] = useState('');// record the input value
    const [showResult, setShowResult] = useState(false);// whether to show the search result
    const [isLoading, setIsLoading] = useState(false);// whether the search is loading
    const [isTimeout, setIsTimeout] = useState(false);// whether the search is timeout
    const [searchResult, setSearchResult] = useState([]);// record the search result
    const [selectedResultIndex, setSelectedResultIndex] = useState(null);// record the selected result index
    const [lastClickTime, setLastClickTime] = useState(0);//record the last click time

    // conversation state management
    const [history, setHistory] = useState([]); //history
    const [inputQuestionValue, setInputQuestionValue] = useState('');
    const [streaming, setStreaming] = useState([]); //current stream
    const [convLoading, setConvLoading] = useState(false);
    const [stopped, setStopped] = useState(false); // judge whether stop or not
    const streamingRef = useRef([]); //

    // search related
    const handleOnChange = (event) => {
        setInputValue(event.target.value);
    };

    const handleKeyPress = async (e) => {
        if (e.key === 'Enter') {
            setShowResult(true);
            setIsLoading(true);
            setIsTimeout(false);
            try{
                let result = await window.search(inputValue,true);
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

        // 发送请求（modelName可自定义，如'deepseek'）
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
                    <span>分块内容</span>
                    <span dangerouslySetInnerHTML={{ __html: item.highlightedContent }} />
                </div>
                <div className='filepath-container'>
                    <span>文件路径</span>
                    <span>{item.filePath}</span>
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
                handleSearch={() => setContent('search')}>
            </LeftBar>
            <div style={{ flex: 1, display: 'flex' }}>
                <PanelGroup direction="horizontal" autoSaveId="main-window-horizontal">
                    <Panel 
                        minSize={20}
                        maxSize={70}
                        defaultSize={30}
                        className='mainwindow-panel_1'>
                        <div className='topbar-tools'>工具栏</div>
                        <Doclist><RepoFileTree/></Doclist>
                    </Panel>
                    <PanelResizeHandle></PanelResizeHandle>
                    <Panel 
                        minSize={30}
                        maxSize={80}
                        defaultSize={70}
                        className='mainwindow-panel_2'>
                        <div className='biaoqian'>标签栏</div>
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
    onChange_Conv, onPressEnter_Conv, onClick_Conv, stopped, onStop
}) => {
    switch (content) {
        case 'conversation':
            return (
                <div className={className}>
                    <div className='maindemo-content'>
                        <PanelGroup direction="vertical" className='conversation-panelgroup'>
                            <Panel minSize={30} maxSize={80} defaultSize={70} className='conversation-panel_1'>
                                <div className='conversation-container' style={{height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', marginTop: 24}}>
                                    <div className="chat-history" style={{flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column'}}>
                                        {history.map((item, idx) => (
                                            <div key={idx} className="chat-history-item" style={{display: 'flex', flexDirection: 'column'}}>
                                                <div className="chat-row chat-row-question">
                                                    <div className="chat-bubble chat-bubble-question">{item.query}</div>
                                                </div>
                                                {item.pending && idx === history.length - 1
                                                    ? (
                                                        <>
                                                            {streaming.reduce((acc, msg, i) => {
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
                                                                    <div className="chat-row">
                                                                        <div className="chat-annotation">检索目的：{retr.annotation}</div>
                                                                    </div>
                                                                    <div className="chat-row">
                                                                        <div className="chat-search">关键词：{retr.search.join('、')}</div>
                                                                    </div>
                                                                    <div className="chat-result-list">
                                                                        {retr.result.map((res, j) => (
                                                                            <div key={j} className="chat-result">
                                                                                <div dangerouslySetInnerHTML={{ __html: res.highlightedContent || res.content || res }} />
                                                                                {res.filePath &&
                                                                                    <div className="chat-result-meta">{res.filePath} [{res.beginLine}-{res.endLine}]</div>
                                                                                }
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </React.Fragment>
                                                            ))}
                                                            {stopped ? (
                                                                <div className="chat-row chat-row-answer">
                                                                    <div className="chat-bubble chat-bubble-answer chat-loading" style={{ color: '#ff4d4f' }}>
                                                                        检索已停止
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="chat-row chat-row-answer">
                                                                    <div className="chat-bubble chat-bubble-answer chat-loading">正在检索...</div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )
                                                    : (
                                                        item.retrieval?.map((retr, i) => (
                                                            <React.Fragment key={i}>
                                                                <div className="chat-row">
                                                                    <div className="chat-annotation">检索目的：{retr.annotation}</div>
                                                                </div>
                                                                <div className="chat-row">
                                                                    <div className="chat-search">关键词：{Array.isArray(retr.search) ? retr.search.join('、') : retr.search}</div>
                                                                </div>
                                                                <div className="chat-result-list">
                                                                    {retr.result?.map((res, j) => (
                                                                        <div key={j} className="chat-result">
                                                                            <div dangerouslySetInnerHTML={{ __html: res.highlightedContent || res.content }} />
                                                                            {res.filePath &&
                                                                                <div className="chat-result-meta">{res.filePath} [{res.beginLine}-{res.endLine}]</div>
                                                                            }
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </React.Fragment>
                                                        ))
                                                    )
                                                }
                                                {!item.pending &&
                                                    <div className="chat-row chat-row-answer">
                                                        <div className="chat-bubble chat-bubble-answer">
                                                            {item.answer}
                                                        </div>
                                                    </div>
                                                }
                                                {item.pending && idx === history.length - 1 &&
                                                    (() => {
                                                        const hasAllRetrieval = streaming.filter(msg => msg.type === 'annotation').length > 0 &&
                                                            streaming.filter(msg => msg.type === 'result').length > 0;
                                                        if (
                                                            hasAllRetrieval &&
                                                            streaming.filter(msg => msg.type === 'answer').length > 0
                                                        ) {
                                                            return (
                                                                <div className="chat-row chat-row-answer">
                                                                    <div className="chat-bubble chat-bubble-answer">
                                                                        {streaming.filter(msg => msg.type === 'answer').map(msg => msg.content).join('')}
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()
                                                }
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Panel>
                            <PanelResizeHandle />
                            <Panel minSize={20} maxSize={70} defaultSize={30} className='conversation-panel_2'>
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
                                            style={{fontSize: 16, padding: '12px', minHeight: 48, maxHeight: 120}}
                                        />
                                    </div>
                                    <div className='button-area' style={{display: 'flex', flexDirection: 'row', alignItems: 'flex-end'}}>
                                        <Button onClick={onClick_Conv} 
                                            disabled={convLoading || !inputQuestionValue.trim()}
                                            className='send-button'
                                            style={{height: 48, fontSize: 16, marginLeft: 12}}>
                                            发送
                                        </Button>
                                        <Button
                                            onClick={onStop}
                                            disabled={!convLoading}
                                            className='stop-button'
                                            style={{ height: 48, fontSize: 16, marginLeft: 12, background: '#ff4d4f', color: '#fff' }}
                                        >
                                            停止
                                        </Button>
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
                                variant="filled">
                            </Input.Search>
                        </div>
                        <div className='searchresult-container'>
                            <div className='explanation-container'>
                                <div className="explanation">
                                    {isTimeout ? <div>请求超时</div>
                                        : isLoading ? <div>加载中</div>
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