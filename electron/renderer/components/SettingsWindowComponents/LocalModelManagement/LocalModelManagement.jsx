import { ConfigProvider, Table, Button, message, Tooltip } from 'antd';
import { CheckOutlined, DeleteOutlined, PlusOutlined, FolderOpenOutlined } from '@ant-design/icons';
import React, { useState, useEffect } from 'react';
import './LocalModelManagement.css';

const LocalModelManagement = ({
    localModelManagement,
    onAddLocalModel,
    onSaveAllSettings,
    onSaveLocalModelSettings,
    onModelListChange,
    isSaving
}) => {
    // -----------------------本地模型状态管理-------------------------

    // 本地模型列表（只包含嵌入和重排序模型）
    const [localModels, setLocalModels] = useState([]);
    // 删除加载状态
    const [deletingModels, setDeletingModels] = useState({});

    //------------------------初始化函数-------------------------

    // 初始化本地模型列表（过滤只保留嵌入和重排序模型）
    useEffect(() => {
        if (localModelManagement?.models) {
            const filteredModels = localModelManagement.models.filter(
                model => model.type === 'embedding' || model.type === 'rerank'
            );
            setLocalModels(filteredModels);
        }
    }, [localModelManagement]);

    //------------------------处理函数-------------------------

    // 处理添加模型
    const handleAddModel = () => {
        if (onAddLocalModel) {
            onAddLocalModel();
        }
    };

    // 处理删除模型
    const handleDeleteModel = (modelName) => {
        setDeletingModels(prev => ({ ...prev, [modelName]: true }));

        try {
            const updatedModels = localModels.filter(
                model => model.name !== modelName
            );

            setLocalModels(updatedModels);

            if (onModelListChange) {
                onModelListChange(updatedModels);
            }

            message.success(`模型 "${modelName}" 已删除`);

        } catch (error) {
            console.error('删除模型失败:', error);
            message.error('删除模型失败');
        } finally {
            setDeletingModels(prev => {
                const newState = { ...prev };
                delete newState[modelName];
                return newState;
            });
        }
    };

    // 处理保存本地模型设置
    const handleSaveLocalModelSettings = () => {
        if (onSaveLocalModelSettings) {
            const localModelSettingsToSave = {
                models: localModels
            };
            onSaveLocalModelSettings(localModelSettingsToSave);
        }
    };

    // 在组件内部添加处理保存所有设置的函数
    const handleSaveAllSettings = () => {
        if (onSaveAllSettings) {
            // 构建当前页面的本地模型设置数据
            const currentLocalModelSettings = {
                localModelManagement: {
                    models: localModels
                }
            };

            // 调用父组件的保存函数，传递当前页面数据
            onSaveAllSettings(currentLocalModelSettings);
        } else {
            // 如果没有传入保存函数，使用本地保存函数
            handleSaveLocalModelSettings();
        }
    };

    // 格式化文件大小
    const formatFileSize = (sizeInMB) => {
        if (sizeInMB >= 1024) {
            return `${(sizeInMB / 1024).toFixed(1)} GB`;
        }
        return `${sizeInMB} MB`;
    };

    // 获取模型类型标签
    const getModelTypeTag = (type) => {
        const typeMap = {
            'embedding': '嵌入模型',
            'rerank': '重排序模型'
        };
        return typeMap[type] || type;
    };

    // 获取模型类型颜色
    const getModelTypeColor = (type) => {
        const colorMap = {
            'embedding': '#52c41a',
            'rerank': '#1890ff'
        };
        return colorMap[type] || '#666666';
    };

    // 表格列定义
    const columns = [
        {
            title: '模型名称',
            dataIndex: 'name',
            key: 'name',
            width: 150,
            align: 'center',
            render: (name) => (
                <span className="model-name">{name}</span>
            )
        },
        {
            title: '模型类型',
            dataIndex: 'type',
            key: 'type',
            width: 120,
            align: 'center',
            render: (type) => (
                <span
                    className="model-type-tag"
                    style={{
                        color: getModelTypeColor(type),
                        backgroundColor: `${getModelTypeColor(type)}20`,
                        border: `1px solid ${getModelTypeColor(type)}40`
                    }}
                >
                    {getModelTypeTag(type)}
                </span>
            )
        },
        {
            title: '模型路径',
            dataIndex: 'path',
            key: 'path',
            width: 250,
            ellipsis: {
                showTitle: false,
            },
            render: (path) => (
                <Tooltip title={path} placement="topLeft">
                    <div className="model-path">
                        <FolderOpenOutlined className="path-icon" />
                        <span className="path-text">{path}</span>
                    </div>
                </Tooltip>
            )
        },
        {
            title: '文件大小',
            dataIndex: 'fileSize',
            key: 'fileSize',
            width: 100,
            align: 'center',
            render: (fileSize) => (
                <span className="file-size">{formatFileSize(fileSize)}</span>
            )
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            align: 'center',
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

    // 准备表格数据
    const dataSource = localModels.map((model, index) => ({
        ...model,
        key: model.name || index,
    }));

    // 深色主题配置
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
        },
    };

    return (
        <div className="local-model-management-container">
            <div className="model-list-container">
                <div className="local-model-settings-explanation">
                    <h4>本地模型管理</h4>
                    <p>管理用于检索的本地嵌入和重排序模型</p>
                </div>
                <div className="local-model-table-wrapper">
                    <ConfigProvider theme={darkTheme}>
                        <Table
                            className="dark-table"
                            columns={columns}
                            dataSource={dataSource}
                            pagination={{
                                pageSize: 8,
                                showSizeChanger: false,
                                size: 'small',
                                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 项，共 ${total} 个模型`,
                            }}
                            size="small"
                            bordered
                            scroll={{ x: 700 }}
                            locale={{
                                emptyText: '暂无本地检索模型，请点击添加按钮添加嵌入或重排序模型'
                            }}
                        />
                    </ConfigProvider>
                </div>
                {/* 模型操作按钮和保存按钮 */}
                <div className="model-controls-container">
                    <div className="model-action-buttons">
                        {/* <ConfigProvider theme={darkTheme}>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={handleAddModel}
                                size="small"
                                className="model-button add-model-button"
                            >
                                添加检索模型
                            </Button>
                        </ConfigProvider> */}
                    </div>
                    <div className="save-button-container">
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

            {/* 模型统计信息 */}
            <div className="section-divider"></div>

            <div className="model-statistics-container">
                <div className="local-model-settings-explanation">
                    <h4>检索模型统计</h4>
                    <p>当前本地检索模型的统计信息</p>
                </div>
                <div className="model-statistics-content">
                    <div className="statistics-item">
                        <span className="statistics-label">嵌入模型：</span>
                        <span className="statistics-value">
                            {localModels.filter(m => m.type === 'embedding').length} 个
                        </span>
                    </div>
                    <div className="statistics-item">
                        <span className="statistics-label">重排序模型：</span>
                        <span className="statistics-value">
                            {localModels.filter(m => m.type === 'rerank').length} 个
                        </span>
                    </div>
                    <div className="statistics-item">
                        <span className="statistics-label">总数量：</span>
                        <span className="statistics-value">
                            {localModels.length} 个
                        </span>
                    </div>
                    <div className="statistics-item">
                        <span className="statistics-label">总占用空间：</span>
                        <span className="statistics-value">
                            {formatFileSize(localModels.reduce((sum, model) => sum + model.fileSize, 0))}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LocalModelManagement;