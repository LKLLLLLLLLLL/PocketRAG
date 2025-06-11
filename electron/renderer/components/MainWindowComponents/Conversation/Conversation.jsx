import React, { useState } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { Input, Button } from 'antd';
import { LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import ConversationTopicContainer from './ConversationTopicContainer/ConversationTopicContainer';
import './Conversation.css';

const { TextArea } = Input;

const Conversation = ({
    className,
    history,
    streaming,
    inputQuestionValue,
    onSendConversation,
    onConvKeyDown,
    convLoading,
    onChange_Conv,
    onPressEnter_Conv,
    onClick_Conv,
    stopped,
    onStop,
    handleInfoClick,
    showInfo,
    info,
    // 新增props
    selected,
    onSelectConversation,
    onNewConversation,
    selectedModel,
    selectedModelName,
    onModelSelect,
    selectedConversationId,
    currentConversationTopic,
    conversationList,
    loadConversationList,
    jumpToFile // 新增跳转文件函数
}) => {const [dropdownOpen, setDropdownOpen] = useState(false);
    const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [showModelInfo, setShowModelInfo] = useState(false);
    const [modelUsageInfo, setModelUsageInfo] = useState([]);
    const [isLoadingUsage, setIsLoadingUsage] = useState(false);    // 加载可用模型列表
    const loadAvailableModels = async () => {
        try {
            const settings = await window.electronAPI.getSettings();
            const generationModels = settings.conversationSettings?.generationModel || [];
            setAvailableModels(generationModels);
            
            // 如果没有选中的模型，自动选择第一个
            if (!selectedModel && generationModels.length > 0) {
                onModelSelect(generationModels[0].name);
            }
        } catch (err) {
            console.error('Failed to load available models:', err);
        }
    };    // 获取模型用量信息
    const fetchModelUsage = async () => {
        if (isLoadingUsage) return; // 防止重复请求
        
        setIsLoadingUsage(true);
        try {
            console.log('开始获取模型用量信息...');
            // 尝试调用后端API获取用量信息
            const usageData = await window.getApiUsage();
            console.log('获取到的用量数据:', usageData);
            setModelUsageInfo(usageData || []);
        } catch (err) {
            console.error('Failed to fetch model usage:', err);
            setModelUsageInfo([]);
        } finally {
            setIsLoadingUsage(false);
        }
    };

    React.useEffect(() => {
        loadAvailableModels();
    }, []);

    // 格式化时间函数
    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins}分钟前`;
        if (diffHours < 24) return `${diffHours}小时前`;
        if (diffDays < 7) return `${diffDays}天前`;
        
        return date.toLocaleDateString('zh-CN', { 
            month: 'short', 
            day: 'numeric' 
        });
    };

    return (
        <div className={className}>
            <div className='maindemo-content'>
                <PanelGroup direction="vertical" className='conversation-panelgroup'>
                    <Panel minSize={50} maxSize={80} defaultSize={70} className='conversation-panel_1'>                        {/* 对话标题容器 */}
                        <div className="conversation-topic-container">
                            <div className="conversation-topic-selector">
                                <div 
                                    className="conversation-topic-current"
                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                >
                                    <span className="topic-title">
                                        {currentConversationTopic || '新对话'}
                                    </span>                                    <span className={`topic-arrow ${dropdownOpen ? 'open' : ''}`}></span>
                                </div>
                                {dropdownOpen && (
                                    <div className="conversation-dropdown">
                                        <div 
                                            className="conversation-dropdown-item new-conversation"
                                            onClick={() => {
                                                onNewConversation();
                                                setDropdownOpen(false);
                                            }}
                                        >
                                            <span className="conversation-title">+ 新对话</span>
                                        </div>
                                        {conversationList.map(conv => (
                                            <div 
                                                key={conv.conversationId}
                                                className={`conversation-dropdown-item ${conv.conversationId === selectedConversationId ? 'active' : ''}`}
                                                onClick={() => {
                                                    onSelectConversation(conv.conversationId);
                                                    setDropdownOpen(false);
                                                }}
                                            >
                                                <span className="conversation-title">{conv.topic}</span>
                                                <span className="conversation-time">
                                                    {formatTime(conv.lastTime)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='conversation-container' style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', marginTop: 12 }}>
                            <div className="chat-history" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                {(history || []).map((item, idx) => (
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
                                                                    {retr.annotation}
                                                                </div>
                                                            )}
                                                            {retr.search.length > 0 && (
                                                                <div className="searchkey-container">
                                                                    关键词：{retr.search.join('、')}
                                                                </div>
                                                            )}
                                                            {retr.result.length > 0 && (
                                                                <div className="conversation-result-list">                                                                    {retr.result.map((res, j) => (
                                                                        <div 
                                                                            key={`result-${i}-${j}`} 
                                                                            className="result0-item"
                                                                            onDoubleClick={() => {
                                                                                if (jumpToFile && res.filePath) {
                                                                                    jumpToFile(res.filePath, res.beginLine, res.endLine);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <div className="result0-item-container">
                                                                                <div className="chunkcontent-container">
                                                                                    <div className="chunkcontent-content">
                                                                                        {res.highlightedContent ? (
                                                                                            <div dangerouslySetInnerHTML={{ __html: res.highlightedContent }} />
                                                                                        ) : (
                                                                                            <ReactMarkdown>{res.content || res}</ReactMarkdown>                                                                                )}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="filepath-container">
                                                                                    <div className="filepath-content">
                                                                                        {res.filePath ? `${res.filePath}${res.beginLine && res.endLine ? ` [${res.beginLine}-${res.endLine}]` : ''}` : ''}
                                                                                    </div>
                                                                                </div>
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
                                                        <React.Fragment key={`completed-retrieval-${idx}-${i}`}>
                                                            {retr.annotation && (
                                                                <div className="annotation-container">
                                                                    {retr.annotation}
                                                                </div>
                                                            )}
                                                            {retr.search && retr.search.length > 0 && (
                                                                <div className="searchkey-container">
                                                                    关键词：{Array.isArray(retr.search) ? retr.search.join('、') : retr.search}
                                                                </div>
                                                            )}
                                                            {/* FIX: Ensure retr.result is an array before mapping */}
                                                            {retr.result && retr.result.length > 0 && (
                                                            <ul className="conversation-result-list">                                                                {retr.result.map((res, j) => (
                                                                    <li 
                                                                        key={`result-${i}-${j}`} 
                                                                        className="result0-item"
                                                                        onDoubleClick={() => {
                                                                            if (jumpToFile && res.filePath) {
                                                                                jumpToFile(res.filePath, res.beginLine, res.endLine);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <div className="result0-item-container">
                                                                            <div className="chunkcontent-container">
                                                                                <div className="chunkcontent-content">
                                                                                    {res.highlightedContent ? (
                                                                                        <div dangerouslySetInnerHTML={{ __html: res.highlightedContent }} />
                                                                                    ) : (
                                                                                        <ReactMarkdown>{res.content || ''}</ReactMarkdown>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="filepath-container">
                                                                                <div className="filepath-content">{res.filePath || ''} {res.beginLine && res.endLine ? `: ${res.beginLine}-${res.endLine}` : ''}</div>
                                                                            </div>
                                                                        </div>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                            )}
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
                            </div>                        </div>
                        
                        {/* 输入框区域 - 直接放在对话面板下方 */}
                        <div className='question-input'>
                            <div className='input-area'>
                                <TextArea
                                    placeholder='请输入问题'
                                    className='conversation-question-input'
                                    onChange={onChange_Conv}
                                    onPressEnter={onPressEnter_Conv}
                                    value={inputQuestionValue}
                                    disabled={convLoading}
                                    showCount={false}
                                    autoSize={{ minRows: 4, maxRows: 8 }}
                                />
                                {/* 右下角控制区域 */}
                                <div className="input-bottom-controls">
                                    <div className="model-info-area">                                        <div 
                                            className="model-info-container"
                                            onMouseEnter={() => {
                                                setShowModelInfo(true);
                                                fetchModelUsage(); // 悬浮时获取最新用量信息
                                            }}
                                            onMouseLeave={() => setShowModelInfo(false)}
                                        >
                                            <div className="model-information-button">
                                                <span className="info-icon">i</span>
                                            </div>                                            {/* 模型信息气泡 */}
                                            {showModelInfo && (() => {
                                                // 显示加载状态或用量信息
                                                if (isLoadingUsage) {
                                                    return (
                                                        <div className="model-info-bubble">
                                                            <div className="model-info-content">
                                                                <div className="info-item">
                                                                    <span className="info-label">加载中...</span>
                                                                </div>
                                                            </div>
                                                            <div className="model-info-arrow"></div>
                                                        </div>
                                                    );
                                                }                                                // 计算当前选中模型的 modelName
                                                const currentSelectedModelName = selectedModelName || 
                                                    availableModels.find(model => model.name === selectedModel)?.modelName;

                                                // 查找当前选中模型的用量信息，使用计算出的 modelName 进行比较
                                                console.log('Debug info:', {
                                                    selectedModel,
                                                    selectedModelName,
                                                    currentSelectedModelName,
                                                    modelUsageInfo,
                                                    availableModels
                                                });
                                                const currentModelUsage = modelUsageInfo.find(usage => usage.model_name === currentSelectedModelName);
                                                if (!currentModelUsage) {
                                                    return (
                                                        <div className="model-info-bubble">
                                                            <div className="model-info-content">
                                                                <div className="info-item">
                                                                    <span className="info-label">暂无用量数据</span>
                                                                </div>                                                                <div className="info-item">
                                                                    <span className="info-label" style={{fontSize: '12px', color: '#666'}}>
                                                                        查找: {currentSelectedModelName}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="model-info-arrow"></div>
                                                        </div>
                                                    );
                                                }
                                                
                                                return (
                                                    <div className="model-info-bubble">
                                                        <div className="model-info-content">
                                                            <div className="info-item">
                                                                <span className="info-label">总Token</span>
                                                                <span className="info-value">{currentModelUsage.total_token || 0}</span>
                                                            </div>
                                                            <div className="info-item">
                                                                <span className="info-label">输入Token</span>
                                                                <span className="info-value">{currentModelUsage.input_token || 0}</span>
                                                            </div>
                                                            <div className="info-item">
                                                                <span className="info-label">输出Token</span>
                                                                <span className="info-value">{currentModelUsage.output_token || 0}</span>
                                                            </div>
                                                        </div>
                                                        <div className="model-info-arrow"></div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <div className="model-and-send">
                                        {/* 简洁的模型选择器 */}
                                        <div className="inline-model-selector">
                                            <div 
                                                className="model-selector-current"
                                                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                                            >
                                                <span className="model-name">
                                                    {selectedModel || '选择模型'}
                                                </span>
                                                <span className={`model-arrow ${modelDropdownOpen ? 'open' : ''}`}></span>
                                            </div>
                                            {modelDropdownOpen && (
                                                <div className="model-dropdown">
                                                    {availableModels.map(model => (
                                                        <div 
                                                            key={model.name}
                                                            className={`model-dropdown-item ${model.name === selectedModel ? 'active' : ''}`}
                                                            onClick={() => {
                                                                onModelSelect(model.name);
                                                                setModelDropdownOpen(false);
                                                            }}
                                                        >
                                                            <div className="model-item-main">
                                                                <span className="model-item-name">{model.name}</span>
                                                                {model.setApiKey && (
                                                                    <span className="model-api-badge">API</span>
                                                                )}
                                                            </div>
                                                            <span className="model-item-desc">{model.modelName}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            onClick={convLoading ? onStop : onClick_Conv}
                                            disabled={convLoading ? false : (!inputQuestionValue.trim() || !selectedModel)}
                                            className={convLoading ? 'stop-button' : 'send-button'}
                                            size="large"
                                            type="primary">
                                            {convLoading ? '停止' : '发送'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    )
}

export default Conversation;