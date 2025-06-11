import { ConfigProvider, Input, Button, Switch, Checkbox, message } from 'antd';
import CustomTable from '../CustomTable/CustomTable';
import AddConfigModal from '../AddConfigModal/AddConfigModal';
import { CheckOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import React, { useState, useEffect } from 'react';
import './SearchSettings.css';

const SearchSettings = ({
    searchSettings,
    localModelManagement,
    onSaveAllSettings,
    onSaveSearchSettings,
    onSearchSettingsChange,
    isSaving
}) => {
    // -----------------------检索设置状态管理-------------------------

    // 搜索结果数限制
    const [searchLimit, setSearchLimit] = useState(10);    // 嵌入配置
    const [embeddingConfigs, setEmbeddingConfigs] = useState([]);
    // 重排序配置
    const [rerankConfigs, setRerankConfigs] = useState([]);    // 统一模态框状态
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [addModalType, setAddModalType] = useState('');
    const [addModalTitle, setAddModalTitle] = useState('');

    //------------------------初始化函数-------------------------

    // 初始化检索设置
    useEffect(() => {
        if (searchSettings) {
            setSearchLimit(searchSettings.searchLimit || 10);
            setEmbeddingConfigs(searchSettings.embeddingConfig?.configs || []);
            setRerankConfigs(searchSettings.rerankConfig?.configs || []);
        }    }, [searchSettings]);

    // 统一的状态同步函数
    const syncToParent = (newSearchLimit, newEmbeddingConfigs, newRerankConfigs) => {
        if (onSearchSettingsChange) {
            const updatedSearchSettings = {
                searchLimit: newSearchLimit,
                embeddingConfig: {
                    configs: newEmbeddingConfigs
                },
                rerankConfig: {
                    configs: newRerankConfigs
                }
            };
            onSearchSettingsChange(updatedSearchSettings);
        }
    };

    //------------------------处理函数-------------------------    // 处理搜索限制变化
    const handleSearchLimitChange = (e) => {
        const value = parseInt(e.target.value) || 1;
        setSearchLimit(value);
        // 立即同步到父组件
        syncToParent(value, embeddingConfigs, rerankConfigs);
    };    // 处理嵌入配置选择变化
    const handleEmbeddingSelectionChange = (name, checked) => {
        const updatedConfigs = embeddingConfigs.map(config =>
            config.name === name
                ? { ...config, selected: checked }
                : config
        );
        setEmbeddingConfigs(updatedConfigs);
        // 立即同步到父组件
        syncToParent(searchLimit, updatedConfigs, rerankConfigs);
    };    // 处理重排序配置选择变化（只能选择一个）
    const handleRerankSelectionChange = (selectedName, checked) => {
        let updatedConfigs;
        if (checked) {
            // 如果用户要选中某个项目，自动取消其他所有项目的选中状态
            const previouslySelected = rerankConfigs.find(config => config.selected);
            updatedConfigs = rerankConfigs.map(config => ({
                ...config,
                selected: config.modelName === selectedName
            }));
            
            // 提供用户反馈
            if (previouslySelected && previouslySelected.modelName !== selectedName) {
                message.info(`已切换至重排序模型: ${selectedName}，自动取消了之前的选择`);
            } else {
                message.success(`已选择重排序模型: ${selectedName}`);
            }
        } else {
            // 如果用户要取消选中，允许取消（这样可以实现没有任何选中的状态）
            updatedConfigs = rerankConfigs.map(config => ({
                ...config,
                selected: config.modelName === selectedName ? false : config.selected
            }));
            
            message.info(`已取消选择重排序模型: ${selectedName}`);
        }
        
        setRerankConfigs(updatedConfigs);
        // 立即同步到父组件
        syncToParent(searchLimit, embeddingConfigs, updatedConfigs);
    };// 处理添加嵌入配置
    const handleAddEmbeddingConfig = () => {
        setAddModalType('embedding');
        setAddModalTitle('添加嵌入配置');
        setAddModalVisible(true);
    };

    // 处理添加重排序配置
    const handleAddRerankConfig = () => {
        setAddModalType('rerank');
        setAddModalTitle('添加重排序配置');
        setAddModalVisible(true);
    };

    // 处理添加配置确认
    const handleAddConfigConfirm = (formData) => {
        try {
            if (addModalType === 'embedding') {
                // 检查配置名称是否重复
                if (embeddingConfigs.some(config => config.name === formData.name)) {
                    message.error('配置名称已存在');
                    return;
                }                // 添加新的嵌入配置
                const newConfig = {
                    name: formData.name,
                    modelName: formData.modelName,
                    inputLength: formData.inputLength,
                    selected: false
                };

                const updatedEmbeddingConfigs = [...embeddingConfigs, newConfig];
                setEmbeddingConfigs(updatedEmbeddingConfigs);
                // 立即同步到父组件
                syncToParent(searchLimit, updatedEmbeddingConfigs, rerankConfigs);
                message.success('嵌入配置添加成功');

            } else if (addModalType === 'rerank') {
                // 检查模型是否已存在
                if (rerankConfigs.some(config => config.modelName === formData.modelName)) {
                    message.error('该重排序模型已添加');
                    return;
                }                // 添加新的重排序配置
                const newConfig = {
                    modelName: formData.modelName,
                    selected: false
                };

                const updatedRerankConfigs = [...rerankConfigs, newConfig];
                setRerankConfigs(updatedRerankConfigs);
                // 立即同步到父组件
                syncToParent(searchLimit, embeddingConfigs, updatedRerankConfigs);
                message.success('重排序配置添加成功');
            }

            setAddModalVisible(false);

        } catch (error) {
            console.error('添加配置失败:', error);
            message.error('添加配置失败');
        }
    };

    // 处理添加配置取消
    const handleAddConfigClose = () => {
        setAddModalVisible(false);
        setAddModalType('');
        setAddModalTitle('');    };    // 删除嵌入配置
    const handleDeleteEmbeddingConfig = (configName) => {
        const updatedEmbeddingConfigs = embeddingConfigs.filter(config => config.name !== configName);
        setEmbeddingConfigs(updatedEmbeddingConfigs);
        // 立即同步到父组件
        syncToParent(searchLimit, updatedEmbeddingConfigs, rerankConfigs);
        message.success(`嵌入配置 "${configName}" 已删除`);
    };

    // 删除重排序配置
    const handleDeleteRerankConfig = (modelName) => {
        const updatedRerankConfigs = rerankConfigs.filter(config => config.modelName !== modelName);
        setRerankConfigs(updatedRerankConfigs);
        // 立即同步到父组件
        syncToParent(searchLimit, embeddingConfigs, updatedRerankConfigs);
        message.success(`重排序配置 "${modelName}" 已删除`);
    };

    // 处理保存检索设置
    const handleSaveSearchSettings = () => {
        if (onSaveSearchSettings) {
            const searchSettingsToSave = {
                searchLimit: searchLimit,
                embeddingConfig: {
                    configs: embeddingConfigs
                },
                rerankConfig: {
                    configs: rerankConfigs
                }
            };
            onSaveSearchSettings(searchSettingsToSave);
        }
    };    // 修改处理保存所有设置的函数
    const handleSaveAllSettings = async () => {
        try {
            console.log('SearchSettings - handleSaveAllSettings called');

            if (onSaveAllSettings) {
                // 构建当前页面的所有设置数据
                const currentSearchSettings = {
                    searchSettings: {
                        searchLimit: searchLimit,
                        embeddingConfig: {
                            configs: embeddingConfigs
                        },
                        rerankConfig: {
                            configs: rerankConfigs
                        }
                    }
                };

                console.log('SearchSettings - 保存数据:', currentSearchSettings);
                // 调用父组件传入的保存函数
                await onSaveAllSettings(currentSearchSettings);
            } else {
                console.log('onSaveAllSettings 函数不可用');
                // 如果没有传入保存函数，使用本地保存函数
                handleSaveSearchSettings();
            }
        } catch (error) {
            console.error('SearchSettings - 保存失败:', error);
            message.error(`保存检索设置失败: ${error.message}`);
        }
    };

    // 获取可用的嵌入模型
    const getAvailableEmbeddingModels = () => {
        return localModelManagement?.models?.filter(model => model.type === 'embedding') || [];
    };

    // 获取可用的重排序模型
    const getAvailableRerankModels = () => {
        return localModelManagement?.models?.filter(model => model.type === 'rerank') || [];
    };    // 嵌入配置表格列定义
    const embeddingColumns = [        {
            title: '启用',
            dataIndex: 'selected',
            key: 'selected',
            width: 50,
            align: 'center',
            render: (selected, record) => (
                <ConfigProvider theme={darkTheme}>
                    <Checkbox
                        checked={selected}
                        onChange={(e) => handleEmbeddingSelectionChange(record.name, e.target.checked)}
                        className="config-checkbox"
                    />
                </ConfigProvider>
            )
        },        {
            title: '配置名称',
            dataIndex: 'name',
            key: 'name',
            width: 140,
            align: 'center',
        },
        {
            title: '模型名称',
            dataIndex: 'modelName',
            key: 'modelName',
            width: 140,
            align: 'center',
        },        {
            title: '分块长度',
            dataIndex: 'inputLength',
            key: 'inputLength',
            width: 120,
            align: 'center',
            render: (length) => `${length} 字符`        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            align: 'center',
            render: (_, record) => (
                <div className="action-button-container">
                    <ConfigProvider theme={darkTheme}>
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                            className="delete-config-button"
                            onClick={() => handleDeleteEmbeddingConfig(record.name)}
                            title="删除配置"
                        />
                    </ConfigProvider>
                </div>
            )
        }
    ];// 重排序配置表格列定义
    const rerankColumns = [        {
            title: '启用',
            dataIndex: 'selected',
            key: 'selected',
            width: 50,
            align: 'center',
            render: (selected, record) => (
                <ConfigProvider theme={darkTheme}>
                    <Checkbox
                        checked={selected}
                        onChange={(e) => handleRerankSelectionChange(record.modelName, e.target.checked)}
                        className="config-checkbox single-select"
                        title="重排序模型只能选择一个，选择新的会自动取消其他选项"
                    />
                </ConfigProvider>
            )
        },        {
            title: '模型名称',
            dataIndex: 'modelName',
            key: 'modelName',
            width: 200,
            align: 'center',        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            align: 'center',
            render: (_, record) => (
                <div className="action-button-container">
                    <ConfigProvider theme={darkTheme}>
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                            className="delete-config-button"
                            onClick={() => handleDeleteRerankConfig(record.modelName)}
                            title="删除配置"
                        />
                    </ConfigProvider>
                </div>
            )
        }
    ];// 深色主题配置
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
            },            Switch: {
                colorPrimary: 'rgba(0, 144, 144, 1)',
                colorPrimaryHover: 'rgba(0, 144, 144, 0.8)',
            },            Checkbox: {
                colorPrimary: 'rgba(0, 144, 144, 1)',
                colorPrimaryHover: 'rgba(0, 144, 144, 0.8)',
                colorBgContainer: 'rgba(255, 255, 255, 0.05)',
                colorBorder: 'rgba(255, 255, 255, 0.3)',
            },
            Radio: {
                colorPrimary: 'rgba(0, 144, 144, 1)',
                colorPrimaryHover: 'rgba(0, 144, 144, 0.8)',
                colorBgContainer: 'rgba(255, 255, 255, 0.05)',
                colorBorder: 'rgba(255, 255, 255, 0.3)',
            },
        },
    };    return (
        <div className="search-settings-container">
            {/* 基础搜索设置 */}
            <div className="settings-group-title">基础设置</div>
            
            {/* 搜索结果数设置 */}
            <div className="setting-item">
                <div className="setting-content">
                    <div className="setting-info">
                        <div className="setting-title">搜索结果数</div>
                        <div className="setting-description">设置搜索返回的结果数量限制，建议 5-20 条</div>
                    </div>
                    <div className="setting-control">
                        <ConfigProvider theme={darkTheme}>
                            <Input
                                type="number"
                                value={searchLimit}
                                onChange={handleSearchLimitChange}
                                min={1}
                                max={100}
                                placeholder="数量"
                                className="compact-input"
                                suffix="条"
                            />
                        </ConfigProvider>
                    </div>
                </div>
            </div>

            {/* 嵌入模型配置 */}
            <div className="settings-group-title">嵌入模型配置</div>
            <div className="settings-group-description">配置文档嵌入使用的模型和参数（可选择多个）</div>
              <div className="search-table-container">
                <CustomTable
                    className="dark-table"
                    columns={embeddingColumns}
                    dataSource={embeddingConfigs.map((config, index) => ({
                        ...config,
                        key: config.name || index,
                    }))}
                    pagination={{
                        pageSize: 5,
                        showSizeChanger: false,
                        size: 'small',
                    }}
                    size="small"
                    bordered
                    locale={{
                        emptyText: '暂无嵌入模型配置'
                    }}
                />
            </div>            {/* 嵌入模型添加按钮 */}
            <div className="model-controls-container">
                <div className="model-action-buttons">
                    <ConfigProvider theme={darkTheme}>                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAddEmbeddingConfig}
                            size="small"
                            className="model-button add-model-button"
                        >
                            添加
                        </Button>
                    </ConfigProvider>
                </div>
            </div>

            {/* 重排序模型配置 */}
            <div className="settings-group-title">重排序模型配置</div>
            <div className="settings-group-description">配置检索结果重排序使用的模型（只能选择一个）</div>
              <div className="search-table-container">
                <CustomTable
                    className="dark-table"
                    columns={rerankColumns}
                    dataSource={rerankConfigs.map((config, index) => ({
                        ...config,
                        key: config.modelName || index,
                    }))}
                    pagination={{
                        pageSize: 5,
                        showSizeChanger: false,
                        size: 'small',
                    }}
                    size="small"
                    bordered
                    locale={{
                        emptyText: '暂无重排序模型配置'
                    }}
                />
            </div>            {/* 重排序模型添加按钮 */}
            <div className="model-controls-container">
                <div className="model-action-buttons">
                    <ConfigProvider theme={darkTheme}>                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAddRerankConfig}
                            size="small"
                            className="model-button add-model-button"
                        >
                            添加
                        </Button>
                    </ConfigProvider>                </div>            </div>

            {/* 添加配置弹窗 */}
            <AddConfigModal
                visible={addModalVisible}
                onClose={handleAddConfigClose}
                onConfirm={handleAddConfigConfirm}
                type={addModalType}
                title={addModalTitle}
                localModels={localModelManagement?.models || []}
                darkTheme={darkTheme}
            />
        </div>
    );
};

export default SearchSettings;