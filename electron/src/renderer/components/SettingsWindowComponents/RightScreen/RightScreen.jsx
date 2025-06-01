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
                    <h3>页面样式设置</h3>
                    <div className="settings-form">
                        <div className="settings-row">
                            <label>字体颜色：</label>
                            <Input placeholder="如 #222222" style={{ width: 180 }} />
                        </div>
                        <div className="settings-row">
                            <label>内边距：</label>
                            <Input placeholder="如 16px" style={{ width: 180 }} />
                        </div>
                        <div className="settings-row">
                            <label>外边距：</label>
                            <Input placeholder="如 8px" style={{ width: 180 }} />
                        </div>
                        <div className="settings-row">
                            <label>边框：</label>
                            <Input placeholder="如 1px solid #ccc" style={{ width: 180 }} />
                        </div>
                        <div className="settings-row">
                            <label>背景色：</label>
                            <Input placeholder="如 #f5f5f5" style={{ width: 180 }} />
                        </div>
                        <div className="settings-row">
                            <label>字体大小：</label>
                            <Input placeholder="如 16px" style={{ width: 180 }} />
                        </div>
                        <div className="settings-row">
                            <label>风格：</label>
                            <Select placeholder="请选择风格" style={{ width: 180 }}>
                                <Option value="light">明亮</Option>
                                <Option value="dark">暗色</Option>
                                <Option value="custom">自定义</Option>
                            </Select>
                        </div>
                    </div>
                </RightScreenContainer>
            );
        case 'localModelManagement':
            return (
                <RightScreenContainer onClick={onClick}>
                    <h3>本地模型管理</h3>
                    <div className="settings-form">
                        <div className="settings-row">
                            <label>模型名称：</label>
                            <Input placeholder="模型名称" style={{ width: 200 }} />
                        </div>
                        <div className="settings-row">
                            <label>路径：</label>
                            <Input placeholder="模型路径" style={{ width: 200 }} />
                        </div>
                        <div className="settings-row">
                            <label>类型：</label>
                            <Select placeholder="请选择类型" style={{ width: 200 }}>
                                <Option value="llm">LLM</Option>
                                <Option value="embedding">Embedding</Option>
                                <Option value="rerank">Rerank</Option>
                            </Select>
                        </div>
                        <div className="settings-row">
                            <label>文件大小：</label>
                            <Input placeholder="如 1.2GB" style={{ width: 200 }} />
                        </div>
                    </div>
                </RightScreenContainer>
            );
        case 'searchSettings':
            return (
                <RightScreenContainer onClick={onClick}>
                    <h3>检索设置</h3>
                    <div className="settings-form">
                        <div className="settings-row">
                            <label>检索上限：</label>
                            <Input type="number" min={1} max={100} placeholder="10" style={{ width: 120 }} />
                        </div>
                        <div className="settings-row">
                            <label>Embedding模型：</label>
                            <EmbeddingModelList />
                        </div>
                        <div className="settings-row">
                            <label>Rerank模型：</label>
                            <Select placeholder="请选择Rerank模型" style={{ width: 200 }}>
                                <Option value="rerank1">rerank1</Option>
                                <Option value="rerank2">rerank2</Option>
                                <Option value="none">无</Option>
                            </Select>
                        </div>
                    </div>
                </RightScreenContainer>
            );
        case 'conversationSettings':
            return (
                <RightScreenContainer onClick={onClick}>
                    <h3>对话模型设置</h3>
                    <div className="settings-form">
                        <GenerationModelList />
                    </div>
                </RightScreenContainer>
            );
        default:
            return (
                <RightScreenContainer onClick={onClick}>
                    <div>Welcome</div>
                </RightScreenContainer>
            );
    }
}

function RightScreenContainer({ children, onClick }) {
    return (
        <div className='rightscreen-container'>
            <div className='closebar-container'>
                <Button className = 'closebutton' icon={<CloseOutlined />} onClick={onClick}></Button>
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
        { name: '', type: 'bge' }
    ]);
    const handleChange = (idx, key, value) => {
        const arr = [...models];
        arr[idx][key] = value;
        setModels(arr);
    };
    const addModel = () => setModels([...models, { name: '', type: 'bge' }]);
    const removeModel = idx => setModels(models.filter((_, i) => i !== idx));
    return (
        <div style={{ width: '100%' }}>
            {models.map((m, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <Select
                        value={m.type}
                        style={{ width: 120, marginRight: 8 }}
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
                        style={{ width: 120, marginRight: 8 }}
                    />
                    {models.length > 1 && (
                        <Button
                            icon={<DeleteOutlined />}
                            onClick={() => removeModel(idx)}
                            size="small"
                            danger
                        />
                    )}
                </div>
            ))}
            <Button icon={<PlusOutlined />} size="small" onClick={addModel} style={{ marginTop: 4 }}>
                添加
            </Button>
        </div>
    );
}

// 支持多个生成模型的输入与选择
function GenerationModelList() {
    const [models, setModels] = useState([
        { name: '', type: 'deepseek', url: '', apiKey: '' }
    ]);
    const handleChange = (idx, key, value) => {
        const arr = [...models];
        arr[idx][key] = value;
        setModels(arr);
    };
    const addModel = () => setModels([...models, { name: '', type: 'deepseek', url: '', apiKey: '' }]);
    const removeModel = idx => setModels(models.filter((_, i) => i !== idx));
    return (
        <div style={{ width: '100%' }}>
            {models.map((m, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                    <Select
                        value={m.type}
                        style={{ width: 110 }}
                        onChange={v => handleChange(idx, 'type', v)}
                    >
                        <Option value="deepseek">deepseek</Option>
                        <Option value="qwen">qwen</Option>
                        <Option value="glm">glm</Option>
                        <Option value="custom">自定义</Option>
                    </Select>
                    <Input
                        value={m.name}
                        onChange={e => handleChange(idx, 'name', e.target.value)}
                        placeholder="模型名称"
                        style={{ width: 110 }}
                    />
                    <Input
                        value={m.url}
                        onChange={e => handleChange(idx, 'url', e.target.value)}
                        placeholder="接口地址"
                        style={{ width: 140 }}
                    />
                    <Input.Password
                        value={m.apiKey}
                        onChange={e => handleChange(idx, 'apiKey', e.target.value)}
                        placeholder="API Key"
                        style={{ width: 110 }}
                    />
                    {models.length > 1 && (
                        <Button
                            icon={<DeleteOutlined />}
                            onClick={() => removeModel(idx)}
                            size="small"
                            danger
                        />
                    )}
                </div>
            ))}
            <Button icon={<PlusOutlined />} size="small" onClick={addModel} style={{ marginTop: 4 }}>
                添加
            </Button>
        </div>
    );
}