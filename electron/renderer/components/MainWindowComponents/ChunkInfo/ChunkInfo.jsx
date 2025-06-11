import React, { useEffect, useState } from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import './ChunkInfo.css';

const ChunkInfo = ({ className }) => {
    const [chunkInfo, setChunkInfo] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState(new Set());

    // 处理展开状态的函数
    const handleExpand = (key, expanded) => {
        console.log('展开状态改变:', key, expanded);
        const newExpandedRows = new Set(expandedRows);
        if (expanded) {
            newExpandedRows.add(key);
        } else {
            newExpandedRows.delete(key);
        }
        setExpandedRows(newExpandedRows);
    };

    // 获取分块信息
    useEffect(() => {
        const fetchChunkInfo = async () => {
            try {
                setLoading(true);
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

    // 文本截断函数
    const truncateText = (text, maxLength) => {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    // 渲染分块ID - 改为垂直居中
    const renderChunkId = (text) => (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '32px'
            }}
        >
            <code
                style={{
                    color: '#cccccc',
                    fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    padding: '2px 4px',
                    borderRadius: '0',
                    fontSize: '12px'
                }}
            >
                {text}
            </code>
        </div>
    );

    // 渲染文件路径 - 改为垂直居中
    const renderFilePath = (text, recordKey) => {
        const key = `filePath-${recordKey}`;
        const isExpanded = expandedRows.has(key);
        const shouldShowExpand = text && text.length > 50;

        return (
            <div
                style={{
                    color: '#cccccc',
                    fontSize: '12px',
                    fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    wordBreak: 'break-all',
                    lineHeight: '1.4',
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '32px'
                }}
                title={text}
            >
                <div>
                    {isExpanded ? text : truncateText(text, 50)}
                    {shouldShowExpand && (
                        <span>
                            {' '}
                            <a
                                onClick={() => handleExpand(key, !isExpanded)}
                                style={{ color: '#00b0b0', cursor: 'pointer', textDecoration: 'none' }}
                            >
                                {isExpanded ? '收起' : '展开'}
                            </a>
                        </span>
                    )}
                </div>
            </div>
        );
    };

    // 渲染行号范围 - 改为垂直居中
    const renderLineRange = (record) => {
        const lineRange = record.beginLine !== undefined && record.endLine !== undefined
            ? `${record.beginLine}-${record.endLine}`
            : record.beginLine !== undefined || record.endLine !== undefined
                ? record.beginLine || record.endLine
                : '-';

        return (
            <div
                style={{
                    color: '#cccccc',
                    fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '32px'
                }}
            >
                {lineRange}
            </div>
        );
    };

    // 渲染嵌入模型 - 改为垂直居中
    const renderEmbeddingName = (text) => (
        <div
            style={{
                color: '#cccccc',
                fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '32px'
            }}
        >
            {text || '-'}
        </div>
    );

    // 渲染分块内容 - 保持左对齐，默认显示三行
    const renderContent = (text, recordKey) => {
        const key = `content-${recordKey}`;
        const isExpanded = expandedRows.has(key);

        // 估算三行能容纳的字符数（根据容器宽度400px，每行大约50-60个中文字符）
        const estimatedThreeLineChars = 150;

        // 判断是否需要展开/收起按钮
        const shouldShowExpand = text && text.length > estimatedThreeLineChars;

        return (
            <div
                style={{
                    color: '#cccccc',
                    lineHeight: '1.4',
                    fontSize: '13px',
                    fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    textAlign: 'left',
                    wordBreak: 'break-word',
                    padding: '4px 0',
                    minHeight: '32px',
                    width: '100%'
                }}
            >
                <div
                    style={{
                        // 使用CSS来限制显示行数
                        display: isExpanded ? 'block' : '-webkit-box',
                        WebkitLineClamp: isExpanded ? 'unset' : 3,
                        WebkitBoxOrient: isExpanded ? 'unset' : 'vertical',
                        overflow: isExpanded ? 'visible' : 'hidden',
                        textOverflow: isExpanded ? 'unset' : 'ellipsis'
                    }}
                >
                    {text || '无内容'}
                </div>

                {shouldShowExpand && (
                    <div style={{ marginTop: '4px' }}>
                        <a
                            onClick={() => handleExpand(key, !isExpanded)}
                            style={{
                                color: '#00b0b0',
                                cursor: 'pointer',
                                textDecoration: 'none',
                                fontSize: '12px'
                            }}
                        >
                            {isExpanded ? '收起' : '展开'}
                        </a>
                    </div>
                )}
            </div>
        );
    };

    // 渲染元数据 - 改为垂直居中
    const renderMetadata = (metadata, recordKey) => {
        if (!metadata) {
            return (
                <div
                    style={{
                        color: '#cccccc',
                        fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '32px'
                    }}
                >
                    无元数据
                </div>
            );
        }

        const metadataStr = typeof metadata === 'object'
            ? JSON.stringify(metadata, null, 2)
            : String(metadata);

        const key = `metadata-${recordKey}`;
        const isExpanded = expandedRows.has(key);
        const shouldShowExpand = metadataStr.length > 100;

        return (
            <div
                style={{
                    color: '#cccccc',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    lineHeight: '1.4',
                    whiteSpace: isExpanded ? 'pre-wrap' : 'normal',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '32px'
                }}
            >
                <div>
                    {isExpanded ? metadataStr : truncateText(metadataStr, 100)}
                    {shouldShowExpand && (
                        <span>
                            {' '}
                            <a
                                onClick={() => handleExpand(key, !isExpanded)}
                                style={{ color: '#00b0b0', cursor: 'pointer', textDecoration: 'none' }}
                            >
                                {isExpanded ? '收起' : '展开'}
                            </a>
                        </span>
                    )}
                </div>
            </div>
        );
    };

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
                <div style={{
                    color: '#999',
                    fontSize: '16px',
                    fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                }}>
                    暂无分块信息
                </div>
                <div style={{
                    color: '#666',
                    fontSize: '14px',
                    marginTop: 8,
                    fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                }}>
                    请确保已经进行了文档索引
                </div>
            </div>
        );
    }

    return (
        <div className={className} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="maindemo-content" style={{ width: "100%", flex: 1, minHeight: 0 }}>
                <div
                    className="chunkinfo-container"
                    style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    {/* 标题栏 */}
                    <div
                        style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid #555',
                            backgroundColor: '#222',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative'
                        }}
                    >
                        <div
                            style={{
                                color: '#fff',
                                fontSize: '20px',
                                fontWeight: 'bold',
                                margin: 0,
                                fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                            }}
                        >
                            分块信息总览
                        </div>

                        <div
                            style={{
                                color: '#999',
                                fontSize: '14px',
                                margin: 0,
                                position: 'absolute',
                                right: '16px',
                                fontFamily: "'Microsoft YaHei', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                            }}
                        >
                            共 {chunkInfo.length} 个分块
                        </div>
                    </div>

                    {/* 表格容器 */}
                    <div 
                        style={{
                            flex: 1, 
                            overflow: 'hidden', 
                            backgroundColor: "#222" 
                        }}>
                        <div
                            className="custom-table-container"
                            style={{
                                height: '100%',
                                overflow: 'auto', // 确保滚动
                                border: '1px solid #555555'
                            }}
                        >
                            <table className="custom-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '120px', position: 'sticky', left: 0, zIndex: 10 }}>分块ID</th>
                                        <th style={{ width: '250px' }}>文件路径</th>
                                        <th style={{ width: '100px' }}>行号范围</th>
                                        <th style={{ width: '120px' }}>嵌入模型</th>
                                        <th style={{ width: '400px' }}>分块内容</th>
                                        <th style={{ width: '200px' }}>元数据</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {chunkInfo.map((item, index) => {
                                        const recordKey = item.chunkId || index;
                                        return (
                                            <tr key={recordKey}>
                                                <td style={{ position: 'sticky', left: 0, zIndex: 5 }}>
                                                    {renderChunkId(item.chunkId)}
                                                </td>
                                                <td>{renderFilePath(item.filePath, recordKey)}</td>
                                                <td>{renderLineRange(item)}</td>
                                                <td>{renderEmbeddingName(item.embeddingName)}</td>
                                                <td>{renderContent(item.content, recordKey)}</td>
                                                <td>{renderMetadata(item.metadata, recordKey)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChunkInfo;