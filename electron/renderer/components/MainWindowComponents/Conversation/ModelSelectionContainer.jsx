import React, { useState, useEffect } from 'react';
import { Select, Typography, Alert, Spin } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import './ModelSelectionContainer.css';

const { Text } = Typography;
const { Option } = Select;

const ModelSelectionContainer = ({
    selectedModel,
    onModelSelect,
    disabled = false
}) => {
    const [availableModels, setAvailableModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // 修改 loadAvailableModels 函数

    const loadAvailableModels = async () => {
        try {
            setLoading(true);
            setError(null);

            // 修复：使用正确的API调用
            const settings = await window.electronAPI.getSettings();
            const generationModels = settings.conversationSettings?.generationModel || [];

            if (generationModels.length === 0) {
                setError('未配置任何对话模型');
                setAvailableModels([]);
                return;
            }

            setAvailableModels(generationModels);

            // 如果没有选中的模型，自动选择第一个
            if (!selectedModel && generationModels.length > 0) {
                onModelSelect(generationModels[0].name);
            }

        } catch (err) {
            console.error('Failed to load available models:', err);
            setError('加载模型列表失败');
            setAvailableModels([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAvailableModels();
    }, []);

    // 处理模型选择
    const handleModelChange = (modelName) => {
        onModelSelect(modelName);
    };

    if (loading) {
        return (
            <div className="model-selection-container">
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <Spin size="small" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="model-selection-container">
                <Alert
                    message={error}
                    type="error"
                    size="small"
                    showIcon
                />
            </div>
        );
    }

    return (
        <div className="model-selection-container">
            <div className="model-select-wrapper">
                <Select
                    value={selectedModel}
                    onChange={handleModelChange}
                    style={{ width: '100%' }}
                    placeholder="请选择对话模型"
                    suffixIcon={<RobotOutlined />}
                    size="small"
                    disabled={disabled}
                >
                    {availableModels.map(model => (
                        <Option key={model.name} value={model.name}>
                            <div className="model-option">
                                <div className="model-option-header">
                                    <Text strong style={{ fontSize: '12px' }}>{model.name}</Text>
                                    {model.setApiKey && (
                                        <span className="api-key-badge">API</span>
                                    )}
                                </div>
                                <Text type="secondary" style={{ fontSize: '10px' }}>
                                    {model.modelName}
                                </Text>
                            </div>
                        </Option>
                    ))}
                </Select>
            </div>

            {selectedModel && (
                <div className="selected-model-info">
                    {(() => {
                        const model = availableModels.find(m => m.name === selectedModel);
                        if (!model) return null;

                        return (
                            <Text type="secondary" style={{ fontSize: '10px' }}>
                                当前模型：{model.modelName}
                                {model.setApiKey && ' (需要API Key)'}
                            </Text>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};

export default ModelSelectionContainer;