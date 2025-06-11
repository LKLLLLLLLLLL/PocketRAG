import React, { useState, useEffect } from 'react';
import { List, Typography, Button, Empty, Spin, Select, Dropdown, Space } from 'antd';
import { MessageOutlined, PlusOutlined, DownOutlined } from '@ant-design/icons';
import './ConversationTopicContainer.css';

const { Title, Text } = Typography;
const { Option } = Select;

const ConversationTopicContainer = ({
    selectedConversationId,
    onSelectConversation,
    onNewConversation,
    currentConversationTopic,
    conversationList,
    loadConversationList
}) => {
    const [loading, setLoading] = useState(false);

    // 组件挂载时加载对话列表 - 添加条件判断
    useEffect(() => {
        console.log('ConversationTopicContainer mounting, loadConversationList available:', typeof loadConversationList === 'function')

        if (loadConversationList && (!conversationList || conversationList.length === 0)) {
            console.log('Loading conversation list on mount...')
            loadConversationList();
        }
    }, []); // 移除loadConversationList依赖，避免循环

    // 格式化时间显示
    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (diffDays === 1) {
            return '昨天';
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else {
            return date.toLocaleDateString('zh-CN');
        }
    };

    // 创建新对话 - 移除自动重新加载，避免循环
    const handleNewConversation = () => {
        onNewConversation();
        // 移除这里的重新加载，避免循环
        // if (loadConversationList) {
        //     loadConversationList();
        // }
    };

    // 构建下拉菜单项
    const menuItems = conversationList.map(conversation => ({
        key: conversation.conversationId,
        label: (
            <div style={{ minWidth: '200px', padding: '4px 0' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '2px' }}>
                    {conversation.topic}
                </div>
                <div style={{ fontSize: '10px', color: '#999' }}>
                    {formatTime(conversation.lastTime)}
                </div>
            </div>
        ),
        onClick: () => {
            console.log('Menu item clicked, conversationId:', conversation.conversationId);
            onSelectConversation(conversation.conversationId); // 传递原始 ID，不转换类型
        }
    }));

    return (
        <div className="conversation-topic-container"
            style={{
                minHeight: 48,
                maxHeight: 80,
                overflow: 'hidden',
                paddingBottom: 4
            }}>
            <div className="conversation-header">
                <div className="conversation-title">
                    <Title level={5} style={{ margin: 0, fontSize: '14px' }}>
                        {currentConversationTopic || '新对话'}
                    </Title>
                </div>
                <div className="conversation-controls">
                    <Space size={8}>
                        {conversationList && conversationList.length > 0 && (
                            <Dropdown
                                menu={{
                                    items: menuItems,
                                }}
                                placement="bottomRight"
                                trigger={['click']}
                            >
                                <Button size="small" type="default">
                                    <Space>
                                        选择对话
                                        <DownOutlined />
                                    </Space>
                                </Button>
                            </Dropdown>
                        )}
                        <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={handleNewConversation}
                        >
                            新建
                        </Button>
                    </Space>
                </div>
            </div>

            {/* 简化信息显示区域，移除重复的标题显示 */}
            <div className="conversation-info">
                {selectedConversationId ? (
                    <div className="current-conversation">
                        <Text type="secondary" style={{ fontSize: '10px' }}>
                            对话ID: {selectedConversationId}
                        </Text>
                        {conversationList && conversationList.length > 0 && (
                            <Text type="secondary" style={{ fontSize: '10px', marginLeft: '12px' }}>
                                共有 {conversationList.length} 个历史对话
                            </Text>
                        )}
                    </div>
                ) : (
                    <div className="no-conversation">
                        <Text type="secondary" style={{ fontSize: '10px' }}>
                            {conversationList && conversationList.length > 0
                                ? `有 ${conversationList.length} 个历史对话，请选择或新建对话`
                                : '暂无历史对话，开始新对话吧'
                            }
                        </Text>
                    </div>
                )}
            </div>

            {/* 当没有对话时显示空状态 */}
            {(!conversationList || conversationList.length === 0) && (
                <div className="empty-state">
                    <Empty
                        description="暂无对话记录"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        imageStyle={{ height: 40 }}
                    >
                        <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={handleNewConversation}
                        >
                            开始第一个对话
                        </Button>
                    </Empty>
                </div>
            )}
        </div>
    );
};

export default ConversationTopicContainer;