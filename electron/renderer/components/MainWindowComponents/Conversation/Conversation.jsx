import React, { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Input, Button } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
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
    info
}) => {
    return(
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
    )
}
export default Conversation;