import React, { useState, useEffect } from 'react';
import { Modal, Input, Select, message, ConfigProvider } from 'antd';
import './AddConfigModal.css';

const AddConfigModal = ({
    visible,
    onClose,
    onConfirm,
    type,
    title,
    localModels = [],
    darkTheme
}) => {
    const [formData, setFormData] = useState({});

    // 初始化表单数据
    useEffect(() => {
        if (visible) {
            switch (type) {
                case 'embedding':
                    setFormData({
                        name: '',
                        modelName: '',
                        inputLength: 512
                    });
                    break;
                case 'rerank':
                    setFormData({
                        modelName: ''
                    });
                    break;
                case 'conversation':
                    setFormData({
                        name: '',
                        modelName: '',
                        url: '',
                        setApiKey: true
                    });
                    break;
                case 'localModel':
                    setFormData({
                        name: '',
                        path: '',
                        type: 'embedding',
                        fileSize: 0
                    });
                    break;
                default:
                    setFormData({});
            }
        }
    }, [visible, type]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleConfirm = () => {
        // 基础验证
        if (type === 'embedding') {
            if (!formData.name?.trim()) {
                message.error('请输入配置名称');
                return;
            }
            if (!formData.modelName) {
                message.error('请选择嵌入模型');
                return;
            }
            if (!formData.inputLength || formData.inputLength <= 0) {
                message.error('分块长度必须大于0');
                return;
            }
        } else if (type === 'rerank') {
            if (!formData.modelName) {
                message.error('请选择重排序模型');
                return;
            }
        } else if (type === 'conversation') {
            if (!formData.name?.trim()) {
                message.error('请输入模型名称');
                return;
            }
            if (!formData.modelName?.trim()) {
                message.error('请输入模型标识');
                return;
            }
            if (!formData.url?.trim()) {
                message.error('请输入API地址');
                return;
            }
        } else if (type === 'localModel') {
            if (!formData.name?.trim()) {
                message.error('请输入模型名称');
                return;
            }
            if (!formData.path?.trim()) {
                message.error('请输入模型路径');
                return;
            }
        }

        onConfirm(formData);
    };

    const getAvailableModels = () => {
        if (type === 'embedding') {
            return localModels.filter(model => model.type === 'embedding');
        } else if (type === 'rerank') {
            return localModels.filter(model => model.type === 'rerank');
        }
        return [];
    };

    const renderFormFields = () => {
        switch (type) {
            case 'embedding':
                return (
                    <>
                        <div className="form-item">
                            <label>配置名称</label>
                            <Input
                                placeholder="请输入配置名称"
                                value={formData.name || ''}
                                onChange={(e) => handleInputChange('name', e.target.value)}
                                className="compact-input"
                            />
                        </div>
                        <div className="form-item">
                            <label>嵌入模型</label>
                            <Select
                                placeholder="请选择嵌入模型"
                                value={formData.modelName}
                                onChange={(value) => handleInputChange('modelName', value)}
                                className="compact-select"
                                style={{ width: '100%' }}
                            >
                                {getAvailableModels().map(model => (
                                    <Select.Option key={model.name} value={model.name}>
                                        {model.name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </div>
                        <div className="form-item">
                            <label>分块长度</label>
                            <Input
                                type="number"
                                placeholder="请输入分块长度"
                                value={formData.inputLength || ''}
                                onChange={(e) => handleInputChange('inputLength', parseInt(e.target.value) || 0)}
                                className="compact-input"
                                suffix="字符"
                                min={1}
                                max={10000}
                            />
                        </div>
                    </>
                );

            case 'rerank':
                return (
                    <div className="form-item">
                        <label>重排序模型</label>
                        <Select
                            placeholder="请选择重排序模型"
                            value={formData.modelName}
                            onChange={(value) => handleInputChange('modelName', value)}
                            className="compact-select"
                            style={{ width: '100%' }}
                        >
                            {getAvailableModels().map(model => (
                                <Select.Option key={model.name} value={model.name}>
                                    {model.name}
                                </Select.Option>
                            ))}
                        </Select>
                    </div>
                );

            case 'conversation':
                return (
                    <>
                        <div className="form-item">
                            <label>模型名称</label>
                            <Input
                                placeholder="请输入模型名称"
                                value={formData.name || ''}
                                onChange={(e) => handleInputChange('name', e.target.value)}
                                className="compact-input"
                            />
                        </div>
                        <div className="form-item">
                            <label>模型标识</label>
                            <Input
                                placeholder="请输入模型标识（如 gpt-4）"
                                value={formData.modelName || ''}
                                onChange={(e) => handleInputChange('modelName', e.target.value)}
                                className="compact-input"
                            />
                        </div>
                        <div className="form-item">
                            <label>API地址</label>
                            <Input
                                placeholder="请输入API地址"
                                value={formData.url || ''}
                                onChange={(e) => handleInputChange('url', e.target.value)}
                                className="compact-input"
                            />
                        </div>
                    </>
                );

            case 'localModel':
                return (
                    <>
                        <div className="form-item">
                            <label>模型名称</label>
                            <Input
                                placeholder="请输入模型名称"
                                value={formData.name || ''}
                                onChange={(e) => handleInputChange('name', e.target.value)}
                                className="compact-input"
                            />
                        </div>
                        <div className="form-item">
                            <label>模型类型</label>
                            <Select
                                value={formData.type}
                                onChange={(value) => handleInputChange('type', value)}
                                className="compact-select"
                                style={{ width: '100%' }}
                            >
                                <Select.Option value="embedding">嵌入模型</Select.Option>
                                <Select.Option value="rerank">重排序模型</Select.Option>
                            </Select>
                        </div>
                        <div className="form-item">
                            <label>模型路径</label>
                            <Input
                                placeholder="请输入模型文件路径"
                                value={formData.path || ''}
                                onChange={(e) => handleInputChange('path', e.target.value)}
                                className="compact-input"
                            />
                        </div>
                        <div className="form-item">
                            <label>文件大小 (MB)</label>
                            <Input
                                type="number"
                                placeholder="请输入文件大小"
                                value={formData.fileSize || ''}
                                onChange={(e) => handleInputChange('fileSize', parseInt(e.target.value) || 0)}
                                className="compact-input"
                                suffix="MB"
                                min={0}
                            />
                        </div>
                    </>
                );

            default:
                return null;
        }
    };

    return (
        <ConfigProvider theme={darkTheme}>
            <Modal
                title={title}
                open={visible}
                onOk={handleConfirm}
                onCancel={onClose}
                okText="添加"
                cancelText="取消"
                width={type === 'localModel' ? 520 : 480}
                className="add-config-modal"
            >
                <div className="modal-form">
                    {renderFormFields()}
                </div>
            </Modal>
        </ConfigProvider>
    );
};

export default AddConfigModal;
