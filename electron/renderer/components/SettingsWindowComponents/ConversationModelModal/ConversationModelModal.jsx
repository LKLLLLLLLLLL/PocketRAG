import React, { useState } from 'react';
import { Modal, Input, Form, message,ConfigProvider} from 'antd';
import './ConversationModelModal.css';

const ConversationModelModal = ({
    open,
    onOk,
    onCancel
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);    // 修改 handleOk 函数，增加更详细的日志
    const handleOk = async () => {
        try {
            setLoading(true);
            const values = await form.validateFields();

            console.log('ConversationModelModal - 表单原始值:');
            Object.entries(values).forEach(([key, value]) => {
                console.log(`  ${key}:`, value, typeof value, 'isNull:', value === null);
            });

            // 更严格的数据清理，确保不会出现 null 值
            const cleanedValues = {};

            // 逐个处理每个字段
            const fields = ['name', 'modelName', 'url', 'apiKey'];
            for (const field of fields) {
                const value = values[field];
                if (value === null || value === undefined) {
                    throw new Error(`${field} 不能为空`);
                }
                
                // 转换为字符串并清理
                const stringValue = String(value).trim();
                if (stringValue === '' || stringValue === 'null' || stringValue === 'undefined') {
                    throw new Error(`${field} 不能为空`);
                }
                
                cleanedValues[field] = stringValue;
            }

            console.log('ConversationModelModal - 清理后的值:');
            Object.entries(cleanedValues).forEach(([key, value]) => {
                console.log(`  ${key}:`, key === 'apiKey' ? '***' : value, typeof value);
            });

            // 验证必填字段
            if (!cleanedValues.name) {
                throw new Error('显示名称不能为空');
            }
            if (!cleanedValues.modelName) {
                throw new Error('API模型名称不能为空');
            }
            if (!cleanedValues.url) {
                throw new Error('接口地址不能为空');
            }
            if (!cleanedValues.apiKey) {
                throw new Error('API密钥不能为空');
            }

            // 验证URL格式
            try {
                new URL(cleanedValues.url);
            } catch (urlError) {
                throw new Error('请输入有效的URL地址');
            }

            // 创建新的模型配置
            const newModel = {
                name: cleanedValues.name,
                modelName: cleanedValues.modelName,
                url: cleanedValues.url,
                setApiKey: true
            };

            console.log('ConversationModelModal - 新模型配置:');
            Object.entries(newModel).forEach(([key, value]) => {
                console.log(`  ${key}:`, value, typeof value);
            });

            console.log('ConversationModelModal - API密钥:', cleanedValues.apiKey, typeof cleanedValues.apiKey, cleanedValues.apiKey === null ? 'IS NULL' : 'NOT NULL');

            // 最终验证传递的参数
            if (typeof cleanedValues.apiKey !== 'string') {
                throw new Error(`API密钥类型错误: ${typeof cleanedValues.apiKey}`);
            }
            if (cleanedValues.apiKey.length === 0) {
                throw new Error('API密钥不能为空字符串');
            }
            if (cleanedValues.apiKey === 'null' || cleanedValues.apiKey === 'undefined') {
                throw new Error('API密钥值无效');
            }

            // 调用父组件的 onOk，传递模型配置和API密钥
            await onOk(newModel, cleanedValues.apiKey);
            form.resetFields();

        } catch (error) {
            console.error('ConversationModelModal - 表单验证失败:', error);
            if (error.errorFields) {
                message.error('请检查输入内容');
            } else {
                message.error(error.message || '添加模型失败');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        form.resetFields();
        onCancel();
    };

    // 深色主题配置
    const darkTheme = {
        token: {
            colorBgElevated: '#2a2a2a',
            colorBgContainer: '#333333',
            colorText: '#ffffff',
            colorTextHeading: '#ffffff',
            colorBorder: '#555555',
            colorPrimary: '#00ffff',
            colorPrimaryHover: '#33ffff',
            colorPrimaryActive: '#00cccc',
            colorBgMask: 'rgba(0, 0, 0, 0.7)',
        },
        components: {
            Modal: {
                headerBg: '#2a2a2a',
                contentBg: '#2a2a2a',
                titleColor: '#ffffff',
            },
            Form: {
                labelColor: '#ffffff',
            },
            Input: {
                colorBgContainer: '#333333',
                colorText: '#ffffff',
                colorBorder: '#555555',
                colorPrimaryHover: '#33ffff',
                colorPrimary: '#00ffff',
                activeBorderColor: '#00ffff',
                hoverBorderColor: '#33ffff',
            },
            Button: {
                colorPrimary: '#00ffff',
                colorPrimaryHover: '#33ffff',
                colorPrimaryActive: '#00cccc',
                colorPrimaryText: '#000000',
            },
        },
    };

    return (
        <ConfigProvider theme={darkTheme}>
            <Modal
                title="添加生成模型"
                open={open}
                onOk={handleOk}
                onCancel={handleCancel}
                confirmLoading={loading}
                width={450} // 减小宽度
                className="dark-modal compact-modal"
            >
                <Form
                    form={form}
                    layout="vertical"
                    requiredMark={false}
                    className="dark-form compact-form"
                >                    <Form.Item
                        name="name"
                        label="显示名称"
                        rules={[
                            { required: true, message: '请输入显示名称' },
                            { whitespace: true, message: '显示名称不能只包含空格' },
                            { min: 1, max: 50, message: '显示名称长度应在1-50字符之间' }
                        ]}
                        style={{ marginBottom: 12 }}
                    >
                        <Input
                            placeholder="例如: DeepSeek（用于界面显示）"
                            size="small"
                            maxLength={50}
                            showCount
                        />
                    </Form.Item>

                    <Form.Item
                        name="modelName"
                        label="API模型名称"
                        rules={[
                            { required: true, message: '请输入API模型名称' },
                            { whitespace: true, message: 'API模型名称不能只包含空格' },
                            { min: 1, max: 100, message: 'API模型名称长度应在1-100字符之间' }
                        ]}
                        style={{ marginBottom: 12 }}
                    >
                        <Input
                            placeholder="例如: deepseek-chat（用于API调用）"
                            size="small"
                            maxLength={100}
                        />
                    </Form.Item>

                    <Form.Item
                        name="url"
                        label="接口地址"
                        rules={[
                            { required: true, message: '请输入URL' },
                            { type: 'url', message: '请输入有效的URL' },
                            { whitespace: true, message: 'URL不能只包含空格' }
                        ]}
                        style={{ marginBottom: 12 }}
                    >
                        <Input
                            placeholder="请输入URL"
                            size="small"
                            maxLength={500}
                        />
                    </Form.Item>                    <Form.Item
                        name="apiKey"
                        label="API密钥"
                        rules={[
                            { required: true, message: '请输入API密钥' },
                            { whitespace: true, message: 'API密钥不能只包含空格' },
                            { min: 1, message: 'API密钥不能为空' }
                        ]}
                        style={{ marginBottom: 0 }}
                    >
                        <Input.Password
                            placeholder="请输入API密钥"
                            size="small"
                            maxLength={200}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </ConfigProvider>
    );
};

export default ConversationModelModal;