import React, { useState } from 'react';
import { Modal, Input, Form, message,ConfigProvider} from 'antd';
import './ConversationModelModal.css';

const ConversationModelModal = ({
    open,
    onOk,
    onCancel
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const handleOk = async () => {
        try {
            setLoading(true);
            const values = await form.validateFields();

            // 创建新的模型配置
            const newModel = {
                name: values.name,
                modelName: values.modelName,
                url: values.url,
                setApiKey: true,
                lastUsed: false
            };

            // 调用父组件的 onOk，传递模型配置和API密钥
            onOk(newModel, values.apiKey);
            form.resetFields();
        } catch (error) {
            console.error('表单验证失败:', error);
            message.error('请检查输入内容');
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
                >
                    <Form.Item
                        name="name"
                        label="名称"
                        rules={[{ required: true, message: '请输入名称' }]}
                        style={{ marginBottom: 12 }} // 减小间距
                    >
                        <Input placeholder="请输入名称" size="small" />
                    </Form.Item>

                    <Form.Item
                        name="modelName"
                        label="模型名称"
                        rules={[{ required: true, message: '请输入模型名称' }]}
                        style={{ marginBottom: 12 }}
                    >
                        <Input placeholder="请输入模型名称" size="small" />
                    </Form.Item>

                    <Form.Item
                        name="url"
                        label="接口地址"
                        rules={[
                            { required: true, message: '请输入URL' },
                            { type: 'url', message: '请输入有效的URL' }
                        ]}
                        style={{ marginBottom: 12 }}
                    >
                        <Input placeholder="请输入URL" size="small" />
                    </Form.Item>

                    <Form.Item
                        name="apiKey"
                        label="API密钥"
                        rules={[{ required: true, message: '请输入API密钥' }]}
                        style={{ marginBottom: 0 }} // 最后一项无底边距
                    >
                        <Input.Password placeholder="请输入API密钥" size="small" />
                    </Form.Item>
                </Form>
            </Modal>
        </ConfigProvider>
    );
};

export default ConversationModelModal;