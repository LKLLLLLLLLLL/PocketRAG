import React, { useState, useEffect } from 'react';
import { Modal, Input, Select, Button, message, ConfigProvider } from 'antd';
import { FolderOpenOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
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
    const [testStatus, setTestStatus] = useState(null); // null, 'testing', 'success', 'error'
    const [testMessage, setTestMessage] = useState('');

    // 初始化表单数据
    useEffect(() => {
        if (visible) {
            // 重置测试状态
            setTestStatus(null);
            setTestMessage('');
            
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
                        apiKey: '',
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
        
        // 如果是对话模型且修改了关键字段，重置测试状态
        if (type === 'conversation' && ['modelName', 'url', 'apiKey'].includes(field)) {
            setTestStatus(null);
            setTestMessage('');
        }
    };

    // 处理文件夹选择
    const handleSelectFolder = async () => {
        try {
            const result = await window.electronAPI.openDir();
            if (result && typeof result === 'string') {
                // 后端返回直接的路径字符串
                const selectedPath = result;
                handleInputChange('path', selectedPath);
                
                // 自动计算文件夹大小
                try {
                    const folderSize = await window.electronAPI.getDirSize(selectedPath);
                    handleInputChange('fileSize', folderSize);
                    message.success(`文件夹选择成功，大小: ${folderSize} MB`);
                } catch (sizeError) {
                    console.warn('无法计算文件夹大小:', sizeError);
                    handleInputChange('fileSize', 0);
                    message.success('文件夹选择成功，但无法计算大小');
                }
            }
        } catch (error) {
            console.error('选择文件夹失败:', error);
            message.error('选择文件夹失败');
        }
    };

    // 处理API测试
    const handleTestAPI = async () => {
        // 验证必填字段
        if (!formData.modelName?.trim()) {
            message.error('请先输入模型标识');
            return;
        }
        if (!formData.url?.trim()) {
            message.error('请先输入API地址');
            return;
        }
        if (!formData.apiKey?.trim()) {
            message.error('请先输入API密钥');
            return;
        }

        setTestStatus('testing');
        setTestMessage('正在测试连接...');

        try {
            // 使用后端API测试接口 - 使用正确的参数格式
            await window.testApi(formData.modelName, formData.url, formData.apiKey);
            
            // 测试成功
            setTestStatus('success');
            setTestMessage('连接测试成功');
            message.success('API连接测试成功');
        } catch (error) {
            console.error('API测试失败:', error);
            setTestStatus('error');
            setTestMessage('连接测试失败');
            message.error('API连接测试失败');
        }
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
            if (!formData.apiKey?.trim()) {
                message.error('请输入API密钥');
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
                return (                <>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>配置名称</label>
                                <div className="form-description">为此嵌入配置设置一个唯一的名称</div>
                            </div>
                            <div className="form-control">
                                <Input
                                    placeholder=""
                                    value={formData.name || ''}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    className="compact-input"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>嵌入模型</label>
                                <div className="form-description">选择用于文档嵌入的模型</div>
                            </div>
                            <div className="form-control">
                                <Select
                                    placeholder=""
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
                        </div>
                    </div>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>分块长度</label>
                                <div className="form-description">设置文档分块的字符数长度</div>
                            </div>                            <div className="form-control">
                                <Input
                                    type="number"
                                    placeholder=""
                                    value={formData.inputLength || ''}
                                    onChange={(e) => handleInputChange('inputLength', parseInt(e.target.value) || 0)}
                                    className="compact-input"
                                    suffix="字符"
                                    min={1}
                                    max={10000}
                                />
                            </div>
                        </div>
                    </div>
                </>
            );
        case 'rerank':
            return (
                <div className="form-item">
                    <div className="form-content">
                        <div className="form-info">
                            <label>重排序模型</label>
                            <div className="form-description">选择用于结果重排序的模型</div>
                        </div>
                        <div className="form-control">
                            <Select
                                placeholder=""
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
                    </div>
                </div>
            );

        case 'conversation':
            return (
                <>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>模型名称</label>
                                <div className="form-description">为此对话模型设置一个显示名称</div>
                            </div>
                            <div className="form-control">
                                <Input
                                    placeholder=""
                                    value={formData.name || ''}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    className="compact-input"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>模型标识</label>
                                <div className="form-description">输入模型的标识符（如 gpt-4）</div>
                            </div>
                            <div className="form-control">
                                <Input
                                    placeholder=""
                                    value={formData.modelName || ''}
                                    onChange={(e) => handleInputChange('modelName', e.target.value)}
                                    className="compact-input"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>API地址</label>
                                <div className="form-description">输入API服务的完整地址</div>
                            </div>
                            <div className="form-control">
                                <Input
                                    placeholder=""
                                    value={formData.url || ''}
                                    onChange={(e) => handleInputChange('url', e.target.value)}
                                    className="compact-input"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>API密钥</label>
                                <div className="form-description">输入模型的API密钥</div>
                            </div>
                            <div className="form-control">
                                <Input.Password
                                    placeholder=""
                                    value={formData.apiKey || ''}
                                    onChange={(e) => handleInputChange('apiKey', e.target.value)}
                                    className="compact-input"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>连接测试</label>
                                <div className="form-description">测试API连接是否正常</div>
                            </div>
                            <div className="form-control">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Button
                                        onClick={handleTestAPI}
                                        loading={testStatus === 'testing'}
                                        disabled={!formData.modelName || !formData.url || !formData.apiKey}
                                        style={{ 
                                            backgroundColor: 'rgba(0, 144, 144, 1)',
                                            borderColor: 'rgba(0, 144, 144, 1)',
                                            color: '#000000'
                                        }}
                                    >
                                        {testStatus === 'testing' ? '测试中...' : '测试连接'}
                                    </Button>
                                    {testStatus === 'success' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#52c41a' }}>
                                            <CheckCircleOutlined />
                                            <span style={{ fontSize: '12px' }}>{testMessage}</span>
                                        </div>
                                    )}
                                    {testStatus === 'error' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff4d4f' }}>
                                            <CloseCircleOutlined />
                                            <span style={{ fontSize: '12px' }}>{testMessage}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            );        case 'localModel':
            return (
                <>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>模型名称</label>
                                <div className="form-description">为本地模型设置一个唯一的名称</div>
                            </div>
                            <div className="form-control">
                                <Input
                                    placeholder=""
                                    value={formData.name || ''}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    className="compact-input"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>模型类型</label>
                                <div className="form-description">选择模型的功能类型</div>
                            </div>
                            <div className="form-control">
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
                        </div>
                    </div>
                    <div className="form-item">
                        <div className="form-content">
                            <div className="form-info">
                                <label>模型路径</label>
                                <div className="form-description">选择模型文件夹路径</div>
                            </div>
                                <div className="form-control">
                                    <div style={{ display: 'flex', gap: '8px', width: '200px' }}>
                                        <Input
                                            placeholder="请选择文件夹"
                                            value={formData.path || ''}
                                            onChange={(e) => handleInputChange('path', e.target.value)}
                                            className="compact-input"
                                            readOnly
                                            style={{ flex: 1 }}
                                        />
                                        <Button
                                            icon={<FolderOpenOutlined />}
                                            onClick={handleSelectFolder}
                                            size="small"
                                            style={{ 
                                                flexShrink: 0,
                                                backgroundColor: 'rgba(0, 144, 144, 1)',
                                                borderColor: 'rgba(0, 144, 144, 1)',
                                                color: '#000000'
                                            }}
                                        >
                                            选择
                                        </Button>
                                    </div>
                                </div>
                            </div>
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
