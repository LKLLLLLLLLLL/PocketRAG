import React, { useState } from 'react';
import { Input } from 'antd';
import { LoadingOutlined, ExclamationCircleOutlined, SearchOutlined, CloseCircleOutlined } from '@ant-design/icons';
import './Search.css';

const Search = ({
    className,
    inputValue,
    onChange,
    onKeyDown,
    onSearchClick,
    isLoading,
    isTimeout,
    showResult,
    resultItem
}) => {
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

                {/* 加载中状态 - 居中显示 */}
                {isLoading && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100%',
                            flexDirection: 'column',
                            flex: 1,
                            backgroundColor: '#222'
                        }}
                    >
                        <LoadingOutlined style={{ fontSize: 32, color: '#00b0b0', marginBottom: 16 }} />
                    </div>
                )}

                {/* 超时状态 - 居中显示 */}
                {isTimeout && !isLoading && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100%',
                            flexDirection: 'column',
                            flex: 1,
                            backgroundColor: '#222'
                        }}
                    >
                        <ExclamationCircleOutlined style={{ fontSize: 32, color: '#ff6b6b', marginBottom: 16 }} />
                        <div style={{
                            color: '#ff6b6b',
                            fontSize: '16px',
                            fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                            marginBottom: 8
                        }}>
                            请求超时
                        </div>
                        {/* <div style={{
                            color: '#666',
                            fontSize: '14px',
                            fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                        }}>
                            请检查网络连接或稍后重试
                        </div> */}
                    </div>
                )}

                {/* 未找到结果状态 - 居中显示 */}
                {!isLoading && !isTimeout && showResult && resultItem.length === 0 && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100%',
                            flexDirection: 'column',
                            flex: 1,
                            backgroundColor: '#222'
                        }}
                    >
                        <CloseCircleOutlined style={{ fontSize: 32, color: '#999', marginBottom: 16 }} />
                        <div style={{
                            color: '#999',
                            fontSize: '16px',
                            fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                            marginBottom: 8
                        }}>
                            未找到结果
                        </div>
                        {/* <div style={{
                            color: '#666',
                            fontSize: '14px',
                            fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                        }}>
                            请尝试其他关键词或检查输入内容
                        </div> */}
                    </div>
                )}

                {/* 等待搜索状态 - 居中显示 */}
                {!isLoading && !isTimeout && !showResult && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100%',
                            flexDirection: 'column',
                            flex: 1,
                            backgroundColor: '#222'
                        }}
                    >
                        <SearchOutlined style={{ fontSize: 32, color: '#00b0b0', marginBottom: 16 }} />
                        <div style={{
                            color: '#999',
                            fontSize: '16px',
                            fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                            marginBottom: 8
                        }}>
                            请进行搜索
                        </div>
                        {/* <div style={{
                            color: '#666',
                            fontSize: '14px',
                            fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                        }}>
                            在上方输入框中输入关键词开始搜索
                        </div> */}
                    </div>
                )}

                {/* 搜索结果容器 - 只在有结果时显示 */}
                {!isLoading && !isTimeout && showResult && resultItem.length > 0 && (
                    <div className='searchresult-container'>
                        <div className='result-ul-container'>
                            <ul className='result-ul'>
                                {resultItem}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Search;