import React, { useEffect, useState } from 'react';
import { Table, Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import './ChunkInfo.css';

const { Text, Paragraph } = Typography;

const ChunkInfo = ({className}) => {
    const [chunkInfo, setChunkInfo] = useState([]);
    const [loading, setLoading] = useState(true);

    // 添加：处理展开状态的函数
    const handleExpand = (key, expanded) => {
        console.log('展开状态改变:', key, expanded);
        // 这里可以添加展开状态的处理逻辑，如果需要的话
    };

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
        <div className={className} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="maindemo-content" style={{ width: "100%",flex: 1, minHeight: 0}}>
                <div
                    className="chunkinfo-container"
                    style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
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
            </div>
        </div>
    );
};

export default ChunkInfo;