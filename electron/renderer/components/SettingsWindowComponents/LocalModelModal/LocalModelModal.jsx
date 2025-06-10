import React, { useState } from 'react';
import { Modal, Input, Select, Button, Form, message, ConfigProvider } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import './LocalModelModal.css';

const { Option } = Select;

const LocalModelModal = ({
    open,
    onOk,
    onCancel
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    // 处理文件夹选择
    const handleSelectFolder = async () => {
        try {
            const result = await window.electronAPI.openDir();
            if (result && !result.canceled && result.filePaths.length > 0) {
                const selectedPath = result.filePaths[0];
                form.setFieldsValue({ path: selectedPath });

                // 计算文件夹大小（这里需要后端支持）
                try {
                    const folderSize = await window.electronAPI.getDirSize(selectedPath);
                    form.setFieldsValue({ fileSize: folderSize });
                } catch (err) {
                    console.warn('无法获取文件夹大小:', err);
                }
            }
        } catch (error) {
            console.error('选择文件夹失败:', error);
            message.error('选择文件夹失败');
        }
    };

    // 处理确认
    const handleOk = async () => {
        try {
            setLoading(true);
            const values = await form.validateFields();

            // // 检查模型路径是否存在
            // const pathExists = await window.electronAPI.pathExists(values.path);
            // if (!pathExists) {
            //     message.error('指定的模型路径不存在');
            //     return;
            // }

            // 构建模型对象
            const newModel = {
                name: values.name,
                path: values.path,
                type: values.type,
                fileSize: values.fileSize || 0
            };

            await onOk(newModel);
            form.resetFields();

        } catch (error) {
            console.error('添加模型失败:', error);
        } finally {
            setLoading(false);
        }
    };

    // 处理取消
    const handleCancel = () => {
        form.resetFields();
        onCancel();
    };

    // 使用相同的深色主题配置
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
            Button: {
                colorPrimary: '#00ffff',
                colorPrimaryHover: '#33ffff',
                colorPrimaryActive: '#00cccc',
                colorPrimaryText: '#000000',
            },
            Input: {
                colorBgContainer: '#333333',
                colorText: '#ffffff',
                colorBorder: '#555555',
                colorPrimaryHover: '#33ffff',
                colorPrimary: '#00ffff',
            },
            Select: {
                colorBgContainer: '#333333',
                colorText: '#ffffff',
                colorBorder: '#555555',
                colorBgElevated: '#2a2a2a',
                optionSelectedBg: '#404040',
            },
            Form: {
                labelColor: '#ffffff',
            },
        },
    };

    return (
        <ConfigProvider theme={darkTheme}>
            <Modal
                title="添加检索模型"
                open={open}
                onOk={handleOk}
                onCancel={handleCancel}
                width={500}
                className="dark-modal local-model-modal"
                confirmLoading={loading}
                okText="添加"
                cancelText="取消"
            >
                <Form
                    form={form}
                    layout="vertical"
                    className="local-model-form"
                >
                    <Form.Item
                        label="模型名称"
                        name="name"
                        rules={[
                            { required: true, message: '请输入模型名称' },
                            { min: 1, max: 50, message: '模型名称长度应在1-50字符之间' }
                        ]}
                    >
                        <Input
                            placeholder="请输入唯一的模型名称"
                            className="dark-input"
                        />
                    </Form.Item>

                    <Form.Item
                        label="模型类型"
                        name="type"
                        rules={[{ required: true, message: '请选择模型类型' }]}
                    >
                        <Select
                            placeholder="请选择模型类型"
                            className="dark-select"
                        >
                            <Option value="embedding">嵌入模型</Option>
                            <Option value="rerank">重排序模型</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label="模型路径"
                        name="path"
                        rules={[{ required: true, message: '请选择模型路径' }]}
                    >
                        <Input.Group compact>
                            <Input
                                placeholder="请选择模型文件夹路径"
                                className="dark-input path-input"
                                readOnly
                            />
                            <Button
                                icon={<FolderOpenOutlined />}
                                onClick={handleSelectFolder}
                                className="folder-select-button"
                            >
                                选择
                            </Button>
                        </Input.Group>
                    </Form.Item>

                    <Form.Item
                        label="文件大小 (MB)"
                        name="fileSize"
                        rules={[
                            { required: true, message: '请输入文件大小' },
                            { type: 'number', min: 0, message: '文件大小必须大于0' }
                        ]}
                    >
                        <Input
                            type="number"
                            placeholder="模型文件大小（MB）"
                            className="dark-input"
                            suffix="MB"
                        />
                    </Form.Item>
                </Form>

                <div className="modal-help-text">
                    <p>说明：</p>
                    <ul>
                        <li>嵌入模型用于将文档转换为向量表示</li>
                        <li>重排序模型用于对检索结果进行重新排序</li>
                        <li>模型名称需要在检索设置中引用，请确保唯一性</li>
                    </ul>
                </div>
            </Modal>
        </ConfigProvider>
    );
};

export default LocalModelModal;