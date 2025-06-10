import { ConfigProvider, Input, Button, Switch, Table, message } from 'antd';
import { CheckOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import React, { useState, useEffect } from 'react';
import './SearchSettings.css';

const SearchSettings = ({
    searchSettings,
    localModelManagement,
    onSaveAllSettings,
    onSaveSearchSettings,
    isSaving
}) => {
    // -----------------------检索设置状态管理-------------------------

    // 搜索结果数限制
    const [searchLimit, setSearchLimit] = useState(10);
    // 嵌入配置
    const [embeddingConfigs, setEmbeddingConfigs] = useState([]);
    // 重排序配置
    const [rerankConfigs, setRerankConfigs] = useState([]);

    //------------------------初始化函数-------------------------

    // 初始化检索设置
    useEffect(() => {
        if (searchSettings) {
            setSearchLimit(searchSettings.searchLimit || 10);
            setEmbeddingConfigs(searchSettings.embeddingConfig?.configs || []);
            setRerankConfigs(searchSettings.rerankConfig?.configs || []);
        }
    }, [searchSettings]);

    //------------------------处理函数-------------------------

    // 处理搜索限制变化
    const handleSearchLimitChange = (e) => {
        const value = parseInt(e.target.value) || 1;
        setSearchLimit(value);
    };

    // 处理嵌入配置选择变化
    const handleEmbeddingSelectionChange = (name, checked) => {
        setEmbeddingConfigs(prev =>
            prev.map(config =>
                config.name === name
                    ? { ...config, selected: checked }
                    : config
            )
        );
    };

    // 处理重排序配置选择变化（只能选择一个）
    const handleRerankSelectionChange = (selectedName, checked) => {
        setRerankConfigs(prev =>
            prev.map(config => ({
                ...config,
                selected: config.modelName === selectedName && checked
            }))
        );
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
    };

    // 修改处理保存所有设置的函数
    const handleSaveAllSettings = () => {
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
            onSaveAllSettings(currentSearchSettings);
        } else {
            console.log('onSaveAllSettings 函数不可用');
            // 如果没有传入保存函数，使用本地保存函数
            handleSaveSearchSettings();
        }
    };

    // 获取可用的嵌入模型
    const getAvailableEmbeddingModels = () => {
        return localModelManagement?.models?.filter(model => model.type === 'embedding') || [];
    };

    // 获取可用的重排序模型
    const getAvailableRerankModels = () => {
        return localModelManagement?.models?.filter(model => model.type === 'rerank') || [];
    };

    // 嵌入配置表格列定义
    const embeddingColumns = [
        {
            title: '配置名称',
            dataIndex: 'name',
            key: 'name',
            width: 150,
            align: 'center',
        },
        {
            title: '模型名称',
            dataIndex: 'modelName',
            key: 'modelName',
            width: 150,
            align: 'center',
        },
        {
            title: '输入长度',
            dataIndex: 'inputLength',
            key: 'inputLength',
            width: 120,
            align: 'center',
            render: (length) => `${length} 字符`
        },
        {
            title: '启用状态',
            dataIndex: 'selected',
            key: 'selected',
            width: 100,
            align: 'center',
            render: (selected, record) => (
                <ConfigProvider theme={darkTheme}>
                    <Switch
                        checked={selected}
                        onChange={(checked) => handleEmbeddingSelectionChange(record.name, checked)}
                        size="small"
                        className="config-switch"
                    />
                </ConfigProvider>
            )
        }
    ];

    // 重排序配置表格列定义
    const rerankColumns = [
        {
            title: '模型名称',
            dataIndex: 'modelName',
            key: 'modelName',
            width: 200,
            align: 'center',
        },
        {
            title: '启用状态',
            dataIndex: 'selected',
            key: 'selected',
            width: 120,
            align: 'center',
            render: (selected, record) => (
                <ConfigProvider theme={darkTheme}>
                    <Switch
                        checked={selected}
                        onChange={(checked) => handleRerankSelectionChange(record.modelName, checked)}
                        size="small"
                        className="config-switch"
                    />
                </ConfigProvider>
            )
        }
    ];

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
            Input: {
                colorBgContainer: '#333333',
                colorText: '#ffffff',
                colorBorder: '#555555',
                colorPrimaryHover: '#33ffff',
                colorPrimary: '#00ffff',
            },
            Switch: {
                colorPrimary: '#00ffff',
                colorPrimaryHover: '#33ffff',
                trackColorToggled: '#00ffff',
            },
        },
    };

    return (
        <div className="search-settings-container">
            {/* 搜索限制设置区域 */}
            <div className="search-section">
                <div className="search-settings-explanation">
                    <h4>搜索配置</h4>
                    <p>设置搜索结果的数量限制</p>
                </div>
                <div className="search-demo-container">
                    <div className="search-setting-display">
                        <div className="search-setting-label">
                            <span>搜索结果数：</span>
                        </div>
                        <div className="search-setting-input-wrapper">
                            <ConfigProvider theme={darkTheme}>
                                <Input
                                    type="number"
                                    value={searchLimit}
                                    onChange={handleSearchLimitChange}
                                    min={1}
                                    max={100}
                                    placeholder="设置搜索结果数量"
                                    className="search-setting-input"
                                    suffix="条"
                                />
                            </ConfigProvider>
                        </div>
                    </div>
                    <div className="search-setting-hint">
                        <span>建议设置为 5-20 条，过多可能影响响应速度</span>
                    </div>
                </div>
                {/* 搜索配置保存按钮 */}
                {/* <div className="search-controls-container">
                    <div className="search-action-buttons">
                        
                    </div>
                    <div className="search-save-button-container">
                        <ConfigProvider theme={darkTheme}>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                onClick={handleSaveSearchSettings}
                                loading={isSaving}
                                size="small"
                                className="save-settings-button"
                                title="保存搜索配置"
                            >
                                保存搜索配置
                            </Button>
                        </ConfigProvider>
                    </div>
                </div> */}
            </div>

            {/* 分隔线 */}
            <div className="section-divider"></div>

            {/* 嵌入模型配置区域 */}
            <div className="search-section">
                <div className="search-settings-explanation">
                    <h4>嵌入模型配置</h4>
                    <p>配置文档嵌入使用的模型和参数（可选择多个）</p>
                </div>
                <div className="search-table-container">
                    <ConfigProvider theme={darkTheme}>
                        <Table
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
                            scroll={{ x: 520 }}
                            locale={{
                                emptyText: '暂无嵌入模型配置'
                            }}
                        />
                    </ConfigProvider>
                </div>
                <div className="config-hint">
                    <span>提示：可以同时启用多个嵌入配置以提高检索效果</span>
                </div>
                {/* 嵌入配置保存按钮 */}
                {/* <div className="search-controls-container">
                    <div className="search-action-buttons">
                        
                    </div>
                    <div className="search-save-button-container">
                        <ConfigProvider theme={darkTheme}>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                onClick={handleSaveSearchSettings}
                                loading={isSaving}
                                size="small"
                                className="save-settings-button"
                                title="保存嵌入配置"
                            >
                                保存嵌入配置
                            </Button>
                        </ConfigProvider>
                    </div>
                </div> */}
            </div>

            {/* 分隔线 */}
            <div className="section-divider"></div>

            {/* 重排序模型配置区域 */}
            <div className="search-section">
                <div className="search-settings-explanation">
                    <h4>重排序模型配置</h4>
                    <p>配置检索结果重排序使用的模型（只能选择一个）</p>
                </div>
                <div className="search-table-container">
                    <ConfigProvider theme={darkTheme}>
                        <Table
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
                            scroll={{ x: 320 }}
                            locale={{
                                emptyText: '暂无重排序模型配置'
                            }}
                        />
                    </ConfigProvider>
                </div>
                <div className="config-hint">
                    <span>提示：重排序可以提高检索精度，但会增加计算时间。不选择任何模型将跳过重排序</span>
                </div>
                {/* 重排序配置保存按钮 */}
                {/* <div className="search-controls-container">
                    <div className="search-action-buttons">
                        
                    </div>
                    <div className="search-save-button-container">
                        <ConfigProvider theme={darkTheme}>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                onClick={handleSaveSearchSettings}
                                loading={isSaving}
                                size="small"
                                className="save-settings-button"
                                title="保存重排序配置"
                            >
                                保存重排序配置
                            </Button>
                        </ConfigProvider>
                    </div>
                </div> */}
            </div>

            {/* 分隔线 */}
            <div className="section-divider"></div>

            <div className="search-controls-container">
                <div className="search-action-buttons">
                    {/* 左侧空白区域，保持布局对称 */}
                </div>
                <div className="search-save-button-container">
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
    );
};

export default SearchSettings;