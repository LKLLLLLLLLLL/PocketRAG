import { Tooltip, Table, ConfigProvider, Input, Button, Checkbox, message } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import React, { useState, useEffect } from 'react';
import './ConversationSettings.css';

const ConversationSettings = ({
    conversationSettings,
    onAddGenerationModel,
    onHistoryLengthChange,
    onSaveAllSettings,
    onSaveModelSettings, // 保存模型设置
    onSaveHistorySettings, // 保存历史设置
    onModelListChange, // 添加模型列表变化回调
    isSaving // 添加保存状态
}) => {
    // -----------------------历史长度状态管理-------------------------
    
    // 历史长度
    const [historyLength, setHistoryLength] = useState(0);

    // -------------------------模型状态管理-------------------------

    // 存储删除加载状态
    const [deletingModels, setDeletingModels] = useState({});

    //------------------------API Key状态管理-------------------------

    // 存储可见的API Key
    const [visibleApiKeys, setVisibleApiKeys] = useState({});

    // 存储加载状态
    const [loadingApiKeys, setLoadingApiKeys] = useState({}); 

    //------------------------历史长度相关函数-------------------------

    // 初始化历史长度
    useEffect(() => {
        const initialLength = conversationSettings?.historyLength || 0;
        setHistoryLength(initialLength);
    }, [conversationSettings]);

    // 处理历史长度输入变化
    const handleHistoryLengthChange = (e) => {
        const value = parseInt(e.target.value) || 0;
        setHistoryLength(value);
        // 立即通知父组件历史长度变化
        if (onHistoryLengthChange) {
            onHistoryLengthChange(value);
        }
    };

    // 处理添加模型
    const handleAddModel = () => {
        if (onAddGenerationModel) {
            onAddGenerationModel();
        }
    };

    // 处理保存模型设置
    const handleSaveModelSettings = () => {
        if (onSaveModelSettings) {
            // 构建要保存的模型设置数据
            const modelSettingsToSave = {
                generationModel: conversationSettings?.generationModel || []
            };
            onSaveModelSettings(modelSettingsToSave);
        }
    };

    // 处理保存历史设置
    const handleSaveHistorySettings = () => {
        if (onSaveHistorySettings) {
            // 构建要保存的历史设置数据
            const historySettingsToSave = {
                historyLength: historyLength
            };
            onSaveHistorySettings(historySettingsToSave);
        }
    };

    // 修改处理保存全部设置的函数
    const handleSaveAllSettings = () => {
        if (onSaveAllSettings) {
            // 构建当前页面的对话设置数据
            const currentConversationSettings = {
                conversationSettings: {
                    historyLength: historyLength,
                    generationModel: conversationSettings?.generationModel || []
                }
            };

            console.log('ConversationSettings - 保存数据:', currentConversationSettings);
            // 调用父组件的保存函数，传递当前页面数据
            onSaveAllSettings(currentConversationSettings);
        } else {
            console.log('onSaveAllSettings 函数不可用');
            // 如果没有传入保存函数，使用本地保存函数
            message.warning('保存函数不可用，请检查配置');
        }
    };

    // 修改API Key查看功能
    const handleViewApiKey = async (modelName) => {
        try {
            // 设置加载状态
            setLoadingApiKeys(prev => ({ ...prev, [modelName]: true }));

            // 获取API Key
            const apiKey = await window.getApiKey(modelName);
            console.log('获取到的API Key:', apiKey);

            if (apiKey && apiKey.apiKey.trim() !== '') {
                // 更新可见状态
                setVisibleApiKeys(prev => ({
                    ...prev,
                    [modelName]: apiKey
                }));

                // 10秒后自动隐藏
                setTimeout(() => {
                    setVisibleApiKeys(prev => {
                        const newState = { ...prev };
                        delete newState[modelName];
                        return newState;
                    });
                }, 10000);

                message.success('API Key已显示，10秒后自动隐藏');
            } else {
                message.warning('该模型未设置API Key');
            }

        } catch (error) {
            console.error('获取API Key失败:', error);
            message.error(`获取API Key失败: ${error.message || '未知错误'}`);
        } finally {
            // 清除加载状态
            setLoadingApiKeys(prev => {
                const newState = { ...prev };
                delete newState[modelName];
                return newState;
            });
        }
    };

    // 处理删除模型
    const handleDeleteModel = (modelName) => {
        // 设置删除加载状态
        setDeletingModels(prev => ({ ...prev, [modelName]: true }));

        try {
            // 从当前模型列表中移除指定模型
            const updatedModels = conversationSettings?.generationModel?.filter(
                model => model.name !== modelName
            ) || [];

            // 更新本地状态（这里需要通过回调通知父组件）
            if (onModelListChange) {
                onModelListChange(updatedModels);
            }

            message.success(`模型 "${modelName}" 已删除`);

        } catch (error) {
            console.error('删除模型失败:', error);
            message.error('删除模型失败');
        } finally {
            // 清除删除加载状态
            setDeletingModels(prev => {
                const newState = { ...prev };
                delete newState[modelName];
                return newState;
            });
        }
    };

    // 准备表格数据
    const dataSource = conversationSettings?.generationModel?.map((model, index) => ({
        ...model,
        key: model.name || index,
    })) || [];

    // 更新表格列定义
    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            width: 110,
            align: 'center',
        },
        {
            title: '模型名称',
            dataIndex: 'modelName',
            key: 'modelName',
            width: 120,
            align: 'center',
        },
        {
            title: 'URL',
            dataIndex: 'url',
            key: 'url',
            width: 180,
            ellipsis: {
                showTitle: false,
            },
            render: (url) => (
                <Tooltip title={url} placement="topLeft">
                    <div
                        className="scrollable-url"
                        onWheel={(e) => {
                            e.preventDefault();
                            e.currentTarget.scrollLeft += e.deltaY > 0 ? 30 : -30;
                        }}
                    >
                        {url}
                    </div>
                </Tooltip>
            )
        },
        // 修改API Key列的渲染逻辑
        {
            title: 'API Key',
            dataIndex: 'setApiKey',
            key: 'setApiKey',
            width: 130,
            align: 'center',
            render: (setApiKey, record) => {
                const isVisible = visibleApiKeys[record.name];
                const isLoading = loadingApiKeys[record.name];

                return (
                    <div className="api-key-container api-key-center">
                        <span className="api-key-status">
                            {isLoading ? (
                                <span className="api-key-loading">加载中...</span>
                            ) : isVisible ? (
                                <span className="api-key-visible" title={isVisible}>
                                    {isVisible.length > 12 ? `${isVisible.substring(0, 12)}...` : isVisible}
                                </span>
                            ) : (
                                // 默认显示状态：如果模型存在则显示星号，否则显示未设置
                                record.name ? '******' : '未设置'
                            )}
                        </span>
                        {/* 只有当模型存在时才显示查看按钮 */}
                        {record.name && !isLoading && (
                            <ConfigProvider theme={darkTheme}>
                                <Button
                                    type="text"
                                    icon={<EyeOutlined />}
                                    size="small"
                                    className="view-api-key-button"
                                    onClick={() => handleViewApiKey(record.name)}
                                    title="点击查看API Key（10秒后自动隐藏）"
                                />
                            </ConfigProvider>
                        )}
                    </div>
                );
            }
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            align: 'center', // 确保列标题居中
            render: (_, record) => {
                const isDeleting = deletingModels[record.name];

                return (
                    <div className="action-button-container">
                        <ConfigProvider theme={darkTheme}>
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                size="small"
                                className="delete-model-button delete-button-center"
                                onClick={() => handleDeleteModel(record.name)}
                                loading={isDeleting}
                                title="删除模型"
                            />
                        </ConfigProvider>
                    </div>
                );
            }
        }
    ];

    // 在主题配置的 components 中添加 Checkbox
    const darkTheme = {
        token: {
            colorBgContainer: '#333333',
            colorText: '#ffffff',
            colorBorder: '#555555',
            colorBgElevated: '#2a2a2a',
            colorTextHeading: '#ffffff',
            colorPrimary: '#00ffff',
        },
        components: {
            Table: {
                headerBg: '#2a2a2a',
                headerColor: '#ffffff',
                rowHoverBg: '#404040',
                borderColor: '#555555',
            },
            Button: {
                colorPrimary: '#00ffff',
                colorPrimaryHover: '#33ffff',
                colorPrimaryActive: '#00cccc',
            },
            Input: {
                colorBgContainer: '#333333',
                colorText: '#ffffff',
                colorBorder: '#555555',
                colorPrimaryHover: '#33ffff',
                colorPrimary: '#00ffff',
            },
            Checkbox: {
                colorPrimary: '#00ffff',
                colorPrimaryHover: '#33ffff',
            },
        },
    };

    return (
        <div className="conversation-settings-container">
            <div className="model-list-container">
                <div className="conversation-settings-explanation">
                    <h4>对话模型设置</h4>
                    <p>当前配置的生成模型列表</p>
                </div>
                <div className="generation-model-table-wrapper">
                    <ConfigProvider theme={darkTheme}>
                        <Table
                            className="dark-table"
                            columns={columns}
                            dataSource={dataSource}
                            pagination={{
                                pageSize: 5,
                                showSizeChanger: false,
                                size: 'small',
                            }}
                            size="small"
                            bordered
                            scroll={{ x: 650 }}
                            locale={{
                                emptyText: '暂无生成模型配置'
                            }}
                        />
                    </ConfigProvider>
                </div>
                {/* 模型操作按钮和保存按钮 */}
                <div className="model-controls-container">
                    <div className="model-action-buttons">
                        <ConfigProvider theme={darkTheme}>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={handleAddModel}
                                size="small"
                                className="model-button add-model-button"
                            >
                                添加
                            </Button>
                        </ConfigProvider>
                    </div>
                    <div className="save-button-container">
                        {/* <ConfigProvider theme={darkTheme}>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                onClick={handleSaveModelSettings}
                                loading={isSaving}
                                size="small"
                                className="save-settings-button"
                                title="保存模型设置"
                            >
                                保存模型设置
                            </Button>
                        </ConfigProvider> */}
                    </div>
                </div>
            </div>

            {/* 分隔线 */}
            <div className="section-divider"></div>

            {/* 简化后的历史长度设置 */}
            <div className="history-length-container">
                <div className="conversation-settings-explanation">
                    <h4>对话历史设置</h4>
                    <p>设置对话历史保留长度（字符数）</p>
                </div>
                <div className="history-demo-container">
                    <div className="history-length-display history-length-split-align">
                        <div className="history-length-label">
                            <span>历史长度：</span>
                        </div>
                        <div className="history-length-input-wrapper">
                            <ConfigProvider theme={darkTheme}>
                                <Input
                                    type="number"
                                    value={historyLength}
                                    onChange={handleHistoryLengthChange}
                                    min={0}
                                    placeholder="请输入历史长度"
                                    className="history-length-input"
                                    suffix="字符"
                                />
                            </ConfigProvider>
                        </div>
                    </div>
                    <div className="history-length-hint">
                        <span>0 表示无限制，建议设置为 2000-8000 字符</span>
                    </div>
                </div>
                <div className="history-controls-container">
                    <div className="history-action-buttons">
                        {/* 左侧空白区域，保持布局对称 */}
                    </div>
                    <div className="history-save-button-container">
                        <ConfigProvider theme={darkTheme}>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                onClick={handleSaveAllSettings}
                                loading={isSaving}
                                size="small"
                                className="save-settings-button"
                                title="保存设置"
                            >
                                保存设置
                            </Button>
                        </ConfigProvider>
                    </div>
                </div>
            </div>
        </div>
    );
}
export default ConversationSettings;