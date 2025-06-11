import { ConfigProvider, Button, message, Tooltip } from 'antd';
import CustomTable from '../CustomTable/CustomTable';
import AddConfigModal from '../AddConfigModal/AddConfigModal'; // 使用统一的 AddConfigModal
import { CheckOutlined, DeleteOutlined, PlusOutlined, FolderOpenOutlined } from '@ant-design/icons';
import React, { useState, useEffect } from 'react';
import './LocalModelManagement.css';

const LocalModelManagement = ({
    localModelManagement,
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
    // 添加模型弹窗状态
    const [addModalVisible, setAddModalVisible] = useState(false);

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

    // 统一的状态同步函数
    const syncToParent = (updatedModels) => {
        if (onModelListChange) {
            onModelListChange(updatedModels);
        }
    };

    // 处理添加模型
    const handleAddModel = () => {
        setAddModalVisible(true);
    };    // 处理添加模型确认
    const handleAddModelConfirm = async (formData) => {
        try {
            console.log('LocalModelManagement - 添加模型数据:', formData);

            // 检查模型名称是否重复
            const isDuplicateName = localModels.some(model => model.name === formData.name);
            if (isDuplicateName) {
                throw new Error('模型名称已存在，请使用其他名称');
            }

            // 检查模型路径是否重复
            const isDuplicatePath = localModels.some(model => model.path === formData.path);
            if (isDuplicatePath) {
                throw new Error('模型路径已存在，请使用其他路径');
            }

            // 验证必填字段
            if (!formData.name || !formData.type || !formData.path) {
                throw new Error('请填写完整的模型信息');
            }            // 创建新的模型配置（fileSize由后端自动计算）
            const newModel = {
                name: formData.name,
                type: formData.type,
                path: formData.path,
                fileSize: formData.fileSize || 0 // 使用表单中计算得到的文件大小
            };

            // 更新本地模型列表
            const updatedModels = [...localModels, newModel];
            setLocalModels(updatedModels);

            // 立即同步到父组件
            syncToParent(updatedModels);

            message.success(`${formData.type === 'embedding' ? '嵌入' : '重排序'}模型 "${formData.name}" 添加成功`);
            setAddModalVisible(false);

        } catch (error) {
            console.error('添加模型失败:', error);
            throw error; // 重新抛出错误，让 LocalModelModal 处理
        }
    };

    // 处理添加模型取消
    const handleAddModalClose = () => {
        setAddModalVisible(false);
    };

    // 处理删除模型
    const handleDeleteModel = (modelName) => {
        setDeletingModels(prev => ({ ...prev, [modelName]: true }));        try {
            const updatedModels = localModels.filter(
                model => model.name !== modelName
            );

            setLocalModels(updatedModels);

            // 立即同步到父组件
            syncToParent(updatedModels);

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
    };    // 在组件内部添加处理保存所有设置的函数
    const handleSaveAllSettings = async () => {
        try {
            console.log('LocalModelManagement - handleSaveAllSettings called');

            if (onSaveAllSettings) {
                // 构建当前页面的本地模型设置数据
                const currentLocalModelSettings = {
                    localModelManagement: {
                        models: localModels
                    }
                };

                console.log('LocalModelManagement - 保存数据:', currentLocalModelSettings);
                // 调用父组件的保存函数，传递当前页面数据
                await onSaveAllSettings(currentLocalModelSettings);
            } else {
                console.log('onSaveAllSettings 函数不可用');
                // 如果没有传入保存函数，使用本地保存函数
                handleSaveLocalModelSettings();
            }
        } catch (error) {
            console.error('LocalModelManagement - 保存失败:', error);
            message.error(`保存本地模型设置失败: ${error.message}`);
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
            )        },        {
            title: '模型路径',
            dataIndex: 'path',
            key: 'path',
            width: 300,
            align: 'center',
            ellipsis: {
                showTitle: false,
            },
            render: (path) => (
                <Tooltip title={path} placement="topLeft">
                    <div 
                        className="model-path"
                        style={{
                            width: '100%',
                            maxWidth: '280px',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textAlign: 'left',
                            padding: '2px 4px'
                        }}
                    >
                        <FolderOpenOutlined className="path-icon" style={{ marginRight: '6px', flexShrink: 0 }} />
                        <span 
                            className="path-text" 
                            style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                minWidth: 0
                            }}
                        >
                            {path}
                        </span>
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
                                className="delete-config-button"
                                onClick={() => handleDeleteModel(record.name)}
                                loading={isDeleting}
                                title="删除模型"
                            />                        </ConfigProvider>
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
        },
    };    return (
        <div className="local-model-management-container">
            {/* 本地模型管理 */}
            <div className="settings-group-title">本地模型管理</div>
            <div className="settings-group-description">管理用于检索的本地嵌入和重排序模型</div>
            <div className="search-table-container">
                <CustomTable
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
                    locale={{
                        emptyText: '暂无本地检索模型，请点击添加按钮添加嵌入或重排序模型'
                    }}
                />
            </div>
            {/* 模型操作按钮 */}
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
            </div>            {/* 添加模型弹窗 */}
            <AddConfigModal
                visible={addModalVisible}
                onClose={handleAddModalClose}
                onConfirm={handleAddModelConfirm}
                type="localModel"
                title="添加本地模型"
                darkTheme={darkTheme}
            />
            
            {/* 底部空白块，防止被悬浮按钮遮挡 */}
            <div className="bottom-spacer"></div>
        </div>
    );
};

export default LocalModelManagement;