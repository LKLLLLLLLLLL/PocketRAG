import React, { useState } from 'react';
import './RightScreen.css'
import { Button, Input, Select } from 'antd';
import { CloseOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Option } = Select;

export default function RightScreen({ content, onClick }) {
    switch (content) {
        case 'page':
            return (
                <RightScreenContainer onClick={onClick}>
                    <div className="settings-header">
                        <h3>页面样式设置</h3>
                        <p>自定义应用界面的视觉风格</p>
                    </div>
                    <div className="settings-form">
                        <div className="settings-group">
                            <h4 className="settings-group-title">基础设置</h4>
                            <div className="settings-grid">
                                <div className="settings-item">
                                    <label>字体颜色</label>
                                    <Input placeholder="#222222" style={{ width: '100%' }} />
                                </div>
                                <div className="settings-item">
                                    <label>内边距</label>
                                    <Input placeholder="16px" style={{ width: '100%' }} />
                                </div>
                                <div className="settings-item">
                                    <label>外边距</label>
                                    <Input placeholder="8px" style={{ width: '100%' }} />
                                </div>
                                <div className="settings-item">
                                    <label>边框</label>
                                    <Input placeholder="1px solid #ccc" style={{ width: '100%' }} />
                                </div>
                                <div className="settings-item">
                                    <label>背景色</label>
                                    <Input placeholder="#f5f5f5" style={{ width: '100%' }} />
                                </div>
                                <div className="settings-item">
                                    <label>字体大小</label>
                                    <Input placeholder="16px" style={{ width: '100%' }} />
                                </div>
                            </div>
                        </div>
                        <div className="settings-group">
                            <h4 className="settings-group-title">主题设置</h4>
                            <div className="settings-item-full">
                                <label>风格</label>
                                <Select defaultValue="light" style={{ width: '100%' }}>
                                    <Option value="light">明亮</Option>
                                    <Option value="dark">暗色</Option>
                                    <Option value="custom">自定义</Option>
                                </Select>
                            </div>
                        </div>
                    </div>
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
                        <div className="settings-group">
                            <h4 className="settings-group-title">添加新模型</h4>
                            <div className="settings-grid">
                                <div className="settings-item">
                                    <label>模型名称</label>
                                    <Input placeholder="模型名称" style={{ width: '100%' }} />
                                </div>
                                <div className="settings-item">
                                    <label>模型路径</label>
                                    <Input placeholder="模型路径" style={{ width: '100%' }} />
                                </div>
                                <div className="settings-item">
                                    <label>模型类型</label>
                                    <Select defaultValue="llm" style={{ width: '100%' }}>
                                        <Option value="llm">LLM</Option>
                                        <Option value="embedding">Embedding</Option>
                                        <Option value="rerank">Rerank</Option>
                                    </Select>
                                </div>
                                <div className="settings-item">
                                    <label>文件大小</label>
                                    <Input placeholder="1.2GB" style={{ width: '100%' }} />
                                </div>
                            </div>
                            <div className="settings-action">
                                <Button type="primary" 
                                        icon={<PlusOutlined />}
                                        color = "cyan"
                                        variant='solid'>
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
                                    <div className="model-table-cell">状态</div>
                                    <div className="model-table-cell">操作</div>
                                </div>
                                <div className="model-table-row">
                                    <div className="model-table-cell">deepseek-7b</div>
                                    <div className="model-table-cell">LLM</div>
                                    <div className="model-table-cell">3.8GB</div>
                                    <div className="model-table-cell"><span className="status-active">已加载</span></div>
                                    <div className="model-table-cell">
                                        <Button size="small" danger icon={<DeleteOutlined />} />
                                    </div>
                                </div>
                                <div className="model-table-row">
                                    <div className="model-table-cell">bge-large</div>
                                    <div className="model-table-cell">Embedding</div>
                                    <div className="model-table-cell">1.2GB</div>
                                    <div className="model-table-cell"><span className="status-active">已加载</span></div>
                                    <div className="model-table-cell">
                                        <Button size="small" danger icon={<DeleteOutlined />} />
                                    </div>
                                </div>
                                <div className="model-table-row">
                                    <div className="model-table-cell">rerank-v1</div>
                                    <div className="model-table-cell">Rerank</div>
                                    <div className="model-table-cell">0.8GB</div>
                                    <div className="model-table-cell"><span className="status-inactive">未加载</span></div>
                                    <div className="model-table-cell">
                                        <Button size="small" danger icon={<DeleteOutlined />} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
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
                        <div className="settings-group">
                            <h4 className="settings-group-title">基础设置</h4>
                            <div className="settings-grid">
                                <div className="settings-item">
                                    <label>检索上限</label>
                                    <Input type="number" defaultValue={10} min={1} max={100} style={{ width: '100%' }} />
                                </div>
                                <div className="settings-item">
                                    <label>嵌入模型</label>
                                    <EmbeddingModelList />
                                </div>
                                <div className="settings-item">
                                    <label>重排模型</label>
                                    <Select defaultValue="none" style={{ width: '100%' }}>
                                        <Option value="rerank1">rerank1</Option>
                                        <Option value="rerank2">rerank2</Option>
                                        <Option value="none">无</Option>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>
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
                        <div className="settings-group">
                            <h4 className="settings-group-title">模型设置</h4>
                            <div className="settings-item-full">
                                <GenerationModelList />
                            </div>
                        </div>
                    </div>
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

// 支持多个嵌入模型的输入与选择
function EmbeddingModelList() {
    const [models, setModels] = useState([
        { name: 'bge-large', type: 'bge' }
    ]);
    const handleChange = (idx, key, value) => {
        const arr = [...models];
        arr[idx][key] = value;
        setModels(arr);
    };
    const addModel = () => setModels([...models, { name: '', type: 'bge' }]);
    const removeModel = idx => setModels(models.filter((_, i) => i !== idx));
    return (
        <div className="model-list-container">
            {models.map((m, idx) => (
                <div key={idx} className="model-list-row">
                    <Select
                        value={m.type}
                        className="model-list-select"
                        onChange={v => handleChange(idx, 'type', v)}
                    >
                        <Option value="bge">bge</Option>
                        <Option value="text2vec">text2vec</Option>
                        <Option value="custom">自定义</Option>
                    </Select>
                    <Input
                        value={m.name}
                        onChange={e => handleChange(idx, 'name', e.target.value)}
                        placeholder="模型名称"
                        className="model-list-input"
                    />
                    {models.length > 1 && (
                        <Button
                            className="model-list-delete"
                            icon={<DeleteOutlined />}
                            onClick={() => removeModel(idx)}
                            size="small"
                            danger
                        />
                    )}
                </div>
            ))}
            <Button 
                icon={<PlusOutlined />} 
                size="small" 
                onClick={addModel} 
                className="model-list-add"
                color = "cyan"
                variant='solid'
            >
                添加模型
            </Button>
        </div>
    );
}

// 支持多个生成模型的输入与选择
function GenerationModelList() {
    const [models, setModels] = useState([
        { name: 'deepseek-7b', type: 'deepseek', url: 'https://api.deepseek.com', apiKey: 'sk-*****' }
    ]);
    const handleChange = (idx, key, value) => {
        const arr = [...models];
        arr[idx][key] = value;
        setModels(arr);
    };
    const addModel = () => setModels([...models, { name: '', type: 'deepseek', url: '', apiKey: '' }]);
    const removeModel = idx => setModels(models.filter((_, i) => i !== idx));
    return (
        <div className="model-table generation-model">
            <div className="model-table-header">
                <div className="model-table-cell">类型</div>
                <div className="model-table-cell">名称</div>
                <div className="model-table-cell">接口地址</div>
                <div className="model-table-cell">API Key</div>
                <div className="model-table-cell">操作</div>
            </div>
            {models.map((m, idx) => (
                <div key={idx} className="model-table-row">
                    <div className="model-table-cell">
                        <Select
                            value={m.type}
                            bordered={false}
                            onChange={v => handleChange(idx, 'type', v)}
                        >
                            <Option value="deepseek">deepseek</Option>
                            <Option value="qwen">qwen</Option>
                            <Option value="glm">glm</Option>
                            <Option value="custom">自定义</Option>
                        </Select>
                    </div>
                    <div className="model-table-cell">
                        <Input
                            value={m.name}
                            onChange={e => handleChange(idx, 'name', e.target.value)}
                            placeholder="模型名称"
                            bordered={false}
                        />
                    </div>
                    <div className="model-table-cell">
                        <Input
                            value={m.url}
                            onChange={e => handleChange(idx, 'url', e.target.value)}
                            placeholder="接口地址"
                            bordered={false}
                        />
                    </div>
                    <div className="model-table-cell">
                        <Input.Password
                            value={m.apiKey}
                            onChange={e => handleChange(idx, 'apiKey', e.target.value)}
                            placeholder="API Key"
                            bordered={false}
                        />
                    </div>
                    <div className="model-table-cell">
                        <Button
                            icon={<DeleteOutlined />}
                            onClick={() => removeModel(idx)}
                            size="small"
                            danger
                        />
                    </div>
                </div>
            ))}
            <div className="model-table-action">
                <Button 
                    icon={<PlusOutlined />} 
                    type="primary"
                    onClick={addModel}
                >
                    添加模型
                </Button>
            </div>
        </div>
    );
}