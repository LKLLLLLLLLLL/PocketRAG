import { Tooltip, ConfigProvider, Input, Button, Checkbox, message } from 'antd';
import CustomTable from '../CustomTable/CustomTable';
import AddConfigModal from '../AddConfigModal/AddConfigModal';
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

    // -------------------------模型状态管理-------------------------    // 存储删除加载状态
    const [deletingModels, setDeletingModels] = useState({});

    // 添加模型弹窗状态
    const [addModalVisible, setAddModalVisible] = useState(false);

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
    };    // 处理添加模型
    const handleAddModel = () => {
        setAddModalVisible(true);
    };

    // 处理添加模型确认
    const handleAddModelConfirm = (formData) => {
        try {
            // 检查模型名称是否重复
            const isDuplicateName = conversationSettings?.generationModel?.some(
                model => model.name === formData.name
            );
            if (isDuplicateName) {
                message.error('模型名称已存在，请使用其他名称');
                return;
            }

            // 检查模型标识是否重复
            const isDuplicateModelName = conversationSettings?.generationModel?.some(
                model => model.modelName === formData.modelName
            );
            if (isDuplicateModelName) {
                message.error('模型标识已存在，请使用其他标识');
                return;
            }

            // 创建新的模型配置
            const newModel = {
                name: formData.name,
                modelName: formData.modelName,
                url: formData.url,
                enabled: true,
                setApiKey: formData.setApiKey || true
            };

            // 更新模型列表
            const updatedModels = [...(conversationSettings?.generationModel || []), newModel];
            
            // 通知父组件模型列表变化
            if (onModelListChange) {
                onModelListChange(updatedModels);
            }

            message.success(`对话模型 "${formData.name}" 添加成功`);
            setAddModalVisible(false);

        } catch (error) {
            console.error('添加模型失败:', error);
            message.error('添加模型失败');
        }
    };

    // 处理添加模型取消
    const handleAddModalClose = () => {
        setAddModalVisible(false);
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
        key: model.name || index,    })) || [];

    // 更新表格列定义
    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            width: 90,
            align: 'center',
        },        {
            title: '模型名称',
            dataIndex: 'modelName',
            key: 'modelName',
            width: 100,
            align: 'center',
        },        {
            title: 'URL',
            dataIndex: 'url',
            key: 'url',
            width: 200,
            align: 'center',
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
        },        // 修改API Key列的渲染逻辑
        {
            title: 'API Key',
            dataIndex: 'setApiKey',
            key: 'setApiKey',
            width: 150,
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
            colorBgContainer: 'rgba(255, 255, 255, 0.05)',
            colorText: '#e0e0e0',
            colorBorder: 'rgba(255, 255, 255, 0.1)',
            colorBgElevated: 'rgba(26, 26, 26, 0.8)',
            colorTextHeading: 'rgba(0, 144, 144, 0.9)',
            colorPrimary: 'rgba(0, 144, 144, 1)',
        },
        components: {
            Button: {
                colorPrimary: 'rgba(0, 144, 144, 1)',
                colorPrimaryHover: 'rgba(0, 144, 144, 0.8)',
                colorPrimaryActive: 'rgba(0, 144, 144, 0.9)',
                colorText: '#e0e0e0',
                colorBgContainer: 'rgba(255, 255, 255, 0.05)',
                colorBorder: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 4,
            },
            Input: {
                colorBgContainer: 'rgba(255, 255, 255, 0.05)',
                colorBorder: 'rgba(255, 255, 255, 0.1)',
                colorText: '#e0e0e0',
                colorTextPlaceholder: 'rgba(255, 255, 255, 0.4)',
                colorPrimary: 'rgba(0, 144, 144, 1)',
                colorPrimaryHover: 'rgba(0, 144, 144, 0.8)',
                activeBorderColor: 'rgba(0, 144, 144, 0.6)',
                hoverBorderColor: 'rgba(0, 144, 144, 0.4)',
            },
            Checkbox: {
                colorPrimary: 'rgba(0, 144, 144, 1)',
                colorPrimaryHover: 'rgba(0, 144, 144, 0.8)',
            },
        },
    };

    return (
        <div className="conversation-settings-container">            {/* 对话模型配置 */}
            <div className="settings-group-title">对话模型设置</div>
            <div className="settings-group-description">当前配置的生成模型列表</div>
            
            <div className="generation-model-table-wrapper">
                <CustomTable
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
                    locale={{
                        emptyText: '暂无生成模型配置'
                    }}
                />
            </div>
            
            {/* 添加模型按钮 */}
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
            </div>

            {/* 对话历史设置 */}
            <div className="settings-group-title">对话历史设置</div>
            
            {/* 历史长度设置 */}
            <div className="setting-item">
                <div className="setting-content">
                    <div className="setting-info">
                        <div className="setting-title">历史长度</div>
                        <div className="setting-description">设置对话历史保留长度（字符数）</div>
                    </div>
                    <div className="setting-control">
                        <ConfigProvider theme={darkTheme}>
                            <Input
                                type="number"
                                value={historyLength}
                                onChange={handleHistoryLengthChange}
                                min={0}
                                placeholder="历史长度"                                className="compact-input"
                                suffix="字符"
                            />
                        </ConfigProvider>
                    </div>                </div>
            </div>

            {/* 添加模型弹窗 */}
            <AddConfigModal
                visible={addModalVisible}
                onClose={handleAddModalClose}
                onConfirm={handleAddModelConfirm}
                type="conversation"
                title="添加对话模型"
                darkTheme={darkTheme}
            />
        </div>
    );
}
export default ConversationSettings;