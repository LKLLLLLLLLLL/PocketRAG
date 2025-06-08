import React, { useState, useEffect } from 'react';
import './RightScreen.css'
import { Button, Input, Select, Switch, Table, message } from 'antd';
import { CloseOutlined, PlusOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';

const { Option } = Select;

export default function RightScreen({ content, onClick }) {
    const [settings, setSettings] = useState(null);
    const [conversationSettings, setConversationSettings] = useState(null);
    const [localModelManagement, setLocalModelManagement] = useState(null);
    const [performance, setPerformance] = useState(null);
    const [searchSettings, setSearchSettings] = useState(null);
    const [tempApiKeys, setTempApiKeys] = useState({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const result = await window.getSettings();
                setSettings(result);
                setConversationSettings(result?.conversationSettings);
                setLocalModelManagement(result?.localModelManagement);
                setPerformance(result?.performance);
                setSearchSettings(result?.searchSettings);
            } catch (err) {
                console.error('Error fetching settings:', err);
                message.error('加载设置失败');
            }
        };

        fetchSettings();
    }, []);

    // 处理设置变化的通用函数
    const handleSettingChange = (path, value) => {
        const newSettings = {...settings};
        const keys = path.split('.');
        let current = newSettings;
        
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
        setSettings(newSettings);
    };

    // 处理嵌入模型选择
    const handleEmbeddingSelect = (index, selected) => {
        const newSearchSettings = {...searchSettings};
        newSearchSettings.embeddingConfig.configs[index].selected = selected;
        setSearchSettings(newSearchSettings);
        handleSettingChange('searchSettings', newSearchSettings);
    };

    // 处理重排模型选择
    const handleRerankSelect = (modelName) => {
        const newSearchSettings = {...searchSettings};
        newSearchSettings.rerankConfig.configs.forEach(config => {
            config.selected = config.modelName === modelName;
        });
        setSearchSettings(newSearchSettings);
        handleSettingChange('searchSettings', newSearchSettings);
    };

    // 处理生成模型选择
    const handleGenerationModelSelect = (modelName) => {
        const newConversationSettings = {...conversationSettings};
        newConversationSettings.generationModel.forEach(model => {
            model.lastUsed = model.name === modelName;
        });
        setConversationSettings(newConversationSettings);
        handleSettingChange('conversationSettings', newConversationSettings);
    };

    // 性能设置切换
    const handlePerformanceToggle = (key, value) => {
        const newPerformance = {...performance, [key]: value};
        setPerformance(newPerformance);
        handleSettingChange('performance', newPerformance);
    };

    // 保存设置到后端
    const saveSettings = async () => {
        setIsSaving(true);
        try {
            // 首先验证设置
            await window.checkSettings(settings);
            
            // 保存设置
            await window.updateSettings(settings);
            
            // 保存所有API Key
            for (const [modelName, apiKey] of Object.entries(tempApiKeys)) {
                if (apiKey) {
                    await window.setApiKey(modelName, apiKey);
                }
            }
            
            message.success('设置保存成功');
        } catch (err) {
            console.error('保存设置失败:', err);
            message.error(`保存设置失败: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // 测试API连接
    const testApiConnection = async (model) => {
        try {
            // 使用临时API Key或已保存的API Key
            const apiKey = tempApiKeys[model.name] || await window.getApiKey(model.name);
            
            if (!apiKey) {
                message.warning('请先设置API Key');
                return;
            }
            
            await window.testApi(model.name, model.url, apiKey);
            message.success('API连接测试成功');
        } catch (err) {
            console.error('API连接测试失败:', err);
            message.error(`API连接测试失败: ${err.message}`);
        }
    };

    // 更新临时API Key存储
    const handleApiKeyChange = (modelName, value) => {
        setTempApiKeys(prev => ({
            ...prev,
            [modelName]: value
        }));
    };

    // 添加新的本地模型
    const addLocalModel = (model) => {
        const newLocalModelManagement = {...localModelManagement};
        newLocalModelManagement.models = [...(newLocalModelManagement.models || []), model];
        setLocalModelManagement(newLocalModelManagement);
        handleSettingChange('localModelManagement', newLocalModelManagement);
    };

    // 删除本地模型
    const removeLocalModel = (modelName) => {
        const newLocalModelManagement = {...localModelManagement};
        newLocalModelManagement.models = newLocalModelManagement.models.filter(m => m.name !== modelName);
        setLocalModelManagement(newLocalModelManagement);
        handleSettingChange('localModelManagement', newLocalModelManagement);
    };

    // 添加新的嵌入模型配置
    const addEmbeddingConfig = () => {
        const newSearchSettings = {...searchSettings};
        const newConfig = {
            name: `bge-m3-${Date.now()}`,
            modelName: "bge-m3",
            inputLength: 512,
            selected: false
        };
        
        newSearchSettings.embeddingConfig.configs.push(newConfig);
        setSearchSettings(newSearchSettings);
        handleSettingChange('searchSettings', newSearchSettings);
    };

    // 移除嵌入模型配置
    const removeEmbeddingConfig = (index) => {
        const newSearchSettings = {...searchSettings};
        newSearchSettings.embeddingConfig.configs.splice(index, 1);
        setSearchSettings(newSearchSettings);
        handleSettingChange('searchSettings', newSearchSettings);
    };

    // 添加新的生成模型
    const addGenerationModel = () => {
        const newConversationSettings = {...conversationSettings};
        const newModel = {
            name: `new-model-${Date.now()}`,
            modelName: "custom-model",
            url: "http://example.com/api",
            setApiKey: true,
            lastUsed: false
        };
        
        newConversationSettings.generationModel.push(newModel);
        setConversationSettings(newConversationSettings);
        handleSettingChange('conversationSettings', newConversationSettings);
    };

    // 移除生成模型
    const removeGenerationModel = (modelName) => {
        const newConversationSettings = {...conversationSettings};
        newConversationSettings.generationModel = newConversationSettings.generationModel.filter(
            m => m.name !== modelName
        );
        setConversationSettings(newConversationSettings);
        handleSettingChange('conversationSettings', newConversationSettings);
    };

    // 渲染保存按钮
    const renderSaveButton = () => (
        <div className="settings-save-container">
            <Button 
                type="primary" 
                icon={<CheckOutlined />} 
                onClick={saveSettings}
                loading={isSaving}
                className="save-button"
                color = "cyan"
                variant = 'solid'
            >
                保存设置
            </Button>
        </div>
    );

    switch (content) {
        case 'page':
            return (
                <RightScreenContainer onClick={onClick}>
                    <div className="settings-header">
                        <h3>页面样式设置</h3>
                        <p>自定义应用界面的视觉风格</p>
                    </div>
                    <div className="settings-form">
                        {/* 页面样式设置内容 */}
                    </div>
                    {renderSaveButton()}
                </RightScreenContainer>
            );
        case 'localModelManagement':
            return (
                <RightScreenContainer onClick={onClick}>
                    <div className="settings-header">
                        <h3>本地模型管理</h3>
                        <p>管理已下载的本地模型</p>
                    </div>
                    <div className="settings-form">
                        <LocalModelManagement 
                            models={localModelManagement?.models || []}
                            onAdd={addLocalModel}
                            onRemove={removeLocalModel}
                        />
                    </div>
                    {renderSaveButton()}
                </RightScreenContainer>
            );
        case 'searchSettings':
            return (
                <RightScreenContainer onClick={onClick}>
                    <div className="settings-header">
                        <h3>检索设置</h3>
                        <p>配置文档检索的相关参数</p>
                    </div>
                    <div className="settings-form">
                        <SearchSettings 
                            settings={searchSettings}
                            onChange={handleSettingChange}
                            onEmbeddingSelect={handleEmbeddingSelect}
                            onRerankSelect={handleRerankSelect}
                            onAddEmbedding={addEmbeddingConfig}
                            onRemoveEmbedding={removeEmbeddingConfig}
                        />
                    </div>
                    {renderSaveButton()}
                </RightScreenContainer>
            );
        case 'conversationSettings':
            return (
                <RightScreenContainer onClick={onClick}>
                    <div className="settings-header">
                        <h3>对话模型设置</h3>
                        <p>配置对话模型的相关参数</p>
                    </div>
                    <div className="settings-form">
                        <ConversationSettings 
                            settings={conversationSettings}
                            tempApiKeys={tempApiKeys}
                            onChange={handleSettingChange}
                            onModelSelect={handleGenerationModelSelect}
                            onApiKeyChange={handleApiKeyChange}
                            onTestApi={testApiConnection}
                            onAddModel={addGenerationModel}
                            onRemoveModel={removeGenerationModel}
                        />
                    </div>
                    {renderSaveButton()}
                </RightScreenContainer>
            );
        case 'performance':
            return (
                <RightScreenContainer onClick={onClick}>
                    <div className="settings-header">
                        <h3>性能设置</h3>
                        <p>优化应用的运行性能</p>
                    </div>
                    <div className="settings-form">
                        <PerformanceSettings 
                            settings={performance}
                            onChange={handleSettingChange}
                            onToggle={handlePerformanceToggle}
                        />
                    </div>
                    {renderSaveButton()}
                </RightScreenContainer>
            );
        default:
            return (
                <RightScreenContainer onClick={onClick}>
                    <div className="welcome-container">
                        <div className="welcome-header">
                            <h2>设置</h2>
                            <p>配置您的应用参数</p>
                        </div>
                        <div className="welcome-content">
                            <div className="welcome-card">
                                <h4>应用信息</h4>
                                <p>版本: v1.0.0</p>
                                <p>更新日期: 2023-11-15</p>
                            </div>
                            <div className="welcome-card">
                                <h4>系统状态</h4>
                                <p>模型加载: 正常</p>
                                <p>存储空间: 256GB可用</p>
                            </div>
                        </div>
                    </div>
                </RightScreenContainer>
            );
    }
}

function RightScreenContainer({ children, onClick }) {
    return (
        <div className='rightscreen-container'>
            <div className='closebar-container'>
                <Button className='closebutton' icon={<CloseOutlined />} onClick={onClick}></Button>
            </div>
            <div className='rightscreen-main'>
                {children}
            </div>
        </div>
    );
}

// 本地模型管理组件
function LocalModelManagement({ models, onAdd, onRemove }) {
    const [newModel, setNewModel] = useState({
        name: '',
        path: '',
        type: 'embedding',
        fileSize: ''
    });

    const handleInputChange = (field, value) => {
        setNewModel(prev => ({ ...prev, [field]: value }));
    };

    const handleAddModel = () => {
        if (!newModel.name || !newModel.path || !newModel.fileSize) {
            message.warning('请填写所有必填字段');
            return;
        }
        
        onAdd({
            ...newModel,
            fileSize: parseInt(newModel.fileSize)
        });
        
        // 重置表单
        setNewModel({
            name: '',
            path: '',
            type: 'embedding',
            fileSize: ''
        });
    };

    return (
        <>
            <div className="settings-group">
                <h4 className="settings-group-title">添加新模型</h4>
                <div className="settings-grid">
                    <div className="settings-item">
                        <label>模型名称</label>
                        <Input 
                            placeholder="模型名称" 
                            value={newModel.name}
                            onChange={e => handleInputChange('name', e.target.value)}
                        />
                    </div>
                    <div className="settings-item">
                        <label>模型路径</label>
                        <Input 
                            placeholder="模型路径" 
                            value={newModel.path}
                            onChange={e => handleInputChange('path', e.target.value)}
                        />
                    </div>
                    <div className="settings-item">
                        <label>模型类型</label>
                        <Select 
                            value={newModel.type}
                            onChange={value => handleInputChange('type', value)}
                        >
                            <Option value="embedding">嵌入模型</Option>
                            <Option value="rerank">Rerank</Option>
                            <Option value="generation">生成模型</Option>
                        </Select>
                    </div>
                    <div className="settings-item">
                        <label>文件大小 (MB)</label>
                        <Input 
                            type="number" 
                            placeholder="2200" 
                            value={newModel.fileSize}
                            onChange={e => handleInputChange('fileSize', e.target.value)}
                        />
                    </div>
                </div>
                <div className="settings-action">
                    <Button 
                        type="primary" 
                        icon={<PlusOutlined />}
                        onClick={handleAddModel}
                        color = "cyan"
                        variant = 'solid'
                    >
                        添加模型
                    </Button>
                </div>
            </div>
            
            <div className="settings-group">
                <h4 className="settings-group-title">已安装模型</h4>
                <div className="model-table">
                    <div className="model-table-header">
                        <div className="model-table-cell">模型名称</div>
                        <div className="model-table-cell">类型</div>
                        <div className="model-table-cell">文件大小</div>
                        <div className="model-table-cell">路径</div>
                        <div className="model-table-cell">操作</div>
                    </div>
                    
                    {models.map((model, index) => (
                        <div key={index} className="model-table-row">
                            <div className="model-table-cell">{model.name}</div>
                            <div className="model-table-cell">{model.type}</div>
                            <div className="model-table-cell">{model.fileSize} MB</div>
                            <div className="model-table-cell" title={model.path}>
                                {model.path.length > 30 ? `${model.path.substring(0, 30)}...` : model.path}
                            </div>
                            <div className="model-table-cell">
                                <Button 
                                    size="small" 
                                    danger 
                                    icon={<DeleteOutlined />}
                                    onClick={() => onRemove(model.name)}
                                    color = "default"
                                    variant = 'text'
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

// 检索设置组件
function SearchSettings({ 
    settings, 
    onChange, 
    onEmbeddingSelect, 
    onRerankSelect,
    onAddEmbedding,
    onRemoveEmbedding
}) {
    if (!settings) return null;
    
    return (
        <>
            <div className="settings-group">
                <h4 className="settings-group-title">基础设置</h4>
                <div className="settings-grid">
                    <div className="settings-item">
                        <label>检索上限</label>
                        <Input 
                            type="number" 
                            value={settings.searchLimit} 
                            min={1} 
                            max={100} 
                            onChange={e => onChange('searchSettings.searchLimit', parseInt(e.target.value))}
                        />
                    </div>
                    <div className="settings-item">
                        <label>嵌入模型</label>
                        <EmbeddingModelList 
                            configs={settings.embeddingConfig?.configs} 
                            onSelect={onEmbeddingSelect}
                            onAdd={onAddEmbedding}
                            onRemove={onRemoveEmbedding}
                        />
                    </div>
                    <div className="settings-item">
                        <label>重排模型</label>
                        <Select 
                            style={{ width: '100%' }}
                            value={settings.rerankConfig?.configs?.find(c => c.selected)?.modelName || 'none'}
                            onChange={onRerankSelect}
                        >
                            <Option value="none">无</Option>
                            {settings.rerankConfig?.configs?.map((config, index) => (
                                <Option key={index} value={config.modelName}>
                                    {config.modelName}
                                </Option>
                            ))}
                        </Select>
                    </div>
                </div>
            </div>
        </>
    );
}

// 嵌入模型列表组件
function EmbeddingModelList({ configs, onSelect, onAdd, onRemove }) {
    if (!configs) return null;
    
    return (
        <div className="model-list-container">
            {configs.map((config, idx) => (
                <div key={idx} className="model-list-row">
                    <div className="model-info">
                        <span className="model-name">{config.name}</span>
                        <span className="model-details">输入长度: {config.inputLength}</span>
                    </div>
                    <div className="model-actions">
                        <Switch 
                            checked={config.selected} 
                            onChange={checked => onSelect && onSelect(idx, checked)}
                        />
                        {configs.length > 1 && (
                            <Button 
                                danger 
                                size="small" 
                                icon={<DeleteOutlined />} 
                                onClick={() => onRemove && onRemove(idx)}
                                style={{ marginLeft: 8 }}
                                color = "default"
                                variant='text'
                            />
                        )}
                    </div>
                </div>
            ))}
            <Button 
                icon={<PlusOutlined />} 
                onClick={onAdd}
                style={{ marginTop: 8 }}
                color = "cyan"
                variant = 'solid'
            >
                添加嵌入模型
            </Button>
        </div>
    );
}

// 对话设置组件
function ConversationSettings({ 
    settings, 
    tempApiKeys, 
    onChange, 
    onModelSelect, 
    onApiKeyChange, 
    onTestApi,
    onAddModel,
    onRemoveModel
}) {
    if (!settings) return null;
    
    return (
        <>
            <div className="settings-group">
                <h4 className="settings-group-title">模型设置</h4>
                <GenerationModelList 
                    models={settings.generationModel} 
                    tempApiKeys={tempApiKeys}
                    onSelect={onModelSelect}
                    onApiKeyChange={onApiKeyChange}
                    onTestApi={onTestApi}
                    onAdd={onAddModel}
                    onRemove={onRemoveModel}
                />
            </div>
            <div className="settings-group">
                <h4 className="settings-group-title">对话历史</h4>
                <div className="settings-item">
                    <label>历史对话长度（字符数）</label>
                    <Input 
                        type="number"
                        value={settings.historyLength}
                        min={0}
                        onChange={e => onChange('conversationSettings.historyLength', parseInt(e.target.value))}
                    />
                    <p className="settings-hint">0 表示无限制</p>
                </div>
            </div>
        </>
    );
}

// 生成模型列表组件
function GenerationModelList({ 
    models, 
    tempApiKeys, 
    onSelect, 
    onApiKeyChange, 
    onTestApi,
    onAdd,
    onRemove
}) {
    if (!models) return null;
    
    return (
        <div className="model-table generation-model">
            <div className="model-table-header">
                <div className="model-table-cell">名称</div>
                <div className="model-table-cell">模型名称</div>
                <div className="model-table-cell">接口地址</div>
                <div className="model-table-cell">API Key</div>
                <div className="model-table-cell">操作</div>
                <div className="model-table-cell">使用中</div>
            </div>
            
            {models.map((model, idx) => (
                <div key={idx} className="model-table-row">
                    <div className="model-table-cell">
                        <Input
                            value={model.name}
                            onChange={e => onSelect(model.name)}
                        />
                    </div>
                    <div className="model-table-cell">
                        <Input
                            value={model.modelName}
                            onChange={e => onSelect(model.name)}
                        />
                    </div>
                    <div className="model-table-cell">
                        <Input
                            value={model.url}
                            onChange={e => onSelect(model.name)}
                        />
                    </div>
                    <div className="model-table-cell">
                        <Input.Password
                            value={tempApiKeys[model.name] || ''}
                            onChange={e => onApiKeyChange(model.name, e.target.value)}
                            placeholder="输入API Key"
                        />
                    </div>
                    <div className="model-table-cell">
                        <Button 
                            onClick={() => onTestApi(model)}
                            style={{ marginRight: 8 }}
                            color = "cyan"
                            variant = 'solid'
                        >
                            测试
                        </Button>
                        {models.length > 1 && (
                            <Button 
                                danger 
                                icon={<DeleteOutlined />} 
                                onClick={() => onRemove(model.name)}
                                variant = "text"
                                color = "default"
                            />
                        )}
                    </div>
                    <div className="model-table-cell">
                        <Switch 
                            checked={model.lastUsed} 
                            onChange={() => onSelect(model.name)}
                        />
                    </div>
                </div>
            ))}
            
            <div className="model-table-action">
                <Button 
                    icon={<PlusOutlined />} 
                    onClick={onAdd}
                    color = "cyan"
                    variant = 'solid'
                >
                    添加模型
                </Button>
            </div>
        </div>
    );
}

// 性能设置组件
function PerformanceSettings({ settings, onChange, onToggle }) {
    if (!settings) return null;
    
    return (
        <div className="settings-group">
            <h4 className="settings-group-title">计算资源</h4>
            <div className="settings-grid">
                <div className="settings-item">
                    <label>最大线程数</label>
                    <Input 
                        type="number" 
                        value={settings.maxThreads} 
                        min={0} 
                        onChange={e => onChange('performance.maxThreads', parseInt(e.target.value))}
                    />
                    <p className="settings-hint">0 表示使用所有可用线程</p>
                </div>
                <div className="settings-item">
                    <label>使用 CUDA</label>
                    <Switch 
                        checked={settings.useCuda} 
                        disabled={!settings['cuda available']}
                        onChange={checked => onToggle('useCuda', checked)}
                    />
                    {!settings['cuda available'] && (
                        <p className="settings-warning">CUDA 不可用</p>
                    )}
                </div>
                <div className="settings-item">
                    <label>使用 CoreML</label>
                    <Switch 
                        checked={settings.useCoreML} 
                        disabled={!settings['coreML available']}
                        onChange={checked => onToggle('useCoreML', checked)}
                    />
                    {!settings['coreML available'] && (
                        <p className="settings-warning">CoreML 不可用</p>
                    )}
                </div>
            </div>
            
            <div className="settings-action" style={{ marginTop: 16 }}>
                <Button 
                    onClick={() => window.getAvailableHardware()}
                    color = "cyan"
                    variant = 'solid'
                >
                    更新硬件信息
                </Button>
            </div>
        </div>
    );
}