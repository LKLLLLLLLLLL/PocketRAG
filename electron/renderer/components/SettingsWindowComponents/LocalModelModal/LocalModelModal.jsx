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
    const [loading, setLoading] = useState(false);    // 处理文件夹选择
    const handleSelectFolder = async () => {
        try {
            const selectedPath = await window.electronAPI.openDir();
            if (selectedPath) {
                form.setFieldsValue({ path: selectedPath });

                // 计算文件夹大小
                try {
                    const folderSize = await window.electronAPI.getDirSize(selectedPath);
                    form.setFieldsValue({ fileSize: folderSize });
                    message.success('文件夹选择成功');
                } catch (err) {
                    console.warn('无法获取文件夹大小:', err);
                    // 即使无法获取大小，也要设置一个默认值
                    form.setFieldsValue({ fileSize: 0 });
                    message.warning('文件夹选择成功，但无法计算大小，请手动输入');
                }
            }
        } catch (error) {
            console.error('选择文件夹失败:', error);
            message.error('选择文件夹失败');
        }
    };// 处理确认
    const handleOk = async () => {
        try {
            setLoading(true);
            const values = await form.validateFields();

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
            message.error(`添加模型失败: ${error.message || error}`);
        } finally {
            setLoading(false);
        }
    };

    // 处理取消
    const handleCancel = () => {
        form.resetFields();
        onCancel();
    };    // 使用与其他弹窗一致的深色主题配置
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
            Select: {
                colorBgContainer: '#333333',
                colorText: '#ffffff',
                colorBorder: '#555555',
                colorBgElevated: '#2a2a2a',
                optionSelectedBg: '#404040',
            },
        },
    };

    return (        <ConfigProvider theme={darkTheme}>
            <Modal
                title="添加检索模型"
                open={open}
                onOk={handleOk}
                onCancel={handleCancel}
                width={450} // 减小宽度与其他弹窗一致
                className="dark-modal compact-modal"
                confirmLoading={loading}
                okText="添加"
                cancelText="取消"
            >
                <Form
                    form={form}
                    layout="vertical"
                    requiredMark={false}
                    className="dark-form compact-form"
                >                    <Form.Item
                        label="模型名称"
                        name="name"
                        rules={[
                            { required: true, message: '请输入模型名称' },
                            { min: 1, max: 50, message: '模型名称长度应在1-50字符之间' }
                        ]}
                        style={{ marginBottom: 12 }}
                    >
                        <Input
                            placeholder="请输入唯一的模型名称"
                            size="small"
                            maxLength={50}
                            showCount
                        />
                    </Form.Item>

                    <Form.Item
                        label="模型类型"
                        name="type"
                        rules={[{ required: true, message: '请选择模型类型' }]}
                        style={{ marginBottom: 12 }}
                    >
                        <Select
                            placeholder="请选择模型类型"
                            size="small"
                        >
                            <Option value="embedding">嵌入模型</Option>
                            <Option value="rerank">重排序模型</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label="模型路径"
                        name="path"
                        rules={[{ required: true, message: '请选择模型路径' }]}
                        style={{ marginBottom: 12 }}
                    >
                        <Input.Group compact>
                            <Input
                                placeholder="请选择模型文件夹路径"
                                size="small"
                                readOnly
                                style={{ width: 'calc(100% - 60px)' }}
                            />
                            <Button
                                icon={<FolderOpenOutlined />}
                                onClick={handleSelectFolder}
                                size="small"
                                style={{ width: '60px' }}
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
                        style={{ marginBottom: 0 }}
                    >
                        <Input
                            type="number"
                            placeholder="模型文件大小（MB）"
                            size="small"
                            suffix="MB"
                        />
                    </Form.Item>                </Form>
            </Modal>
        </ConfigProvider>
    );
};

export default LocalModelModal;