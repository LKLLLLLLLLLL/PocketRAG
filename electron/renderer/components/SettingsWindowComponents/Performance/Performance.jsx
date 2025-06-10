import { ConfigProvider, Input, Button, Switch, message } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import React, { useState, useEffect } from 'react';
import './Performance.css';

const Performance = ({
    performanceSettings,
    onSaveAllSettings,
    onSavePerformanceSettings,
    isSaving
}) => {
    // -----------------------性能设置状态管理-------------------------

    // 最大线程数
    const [maxThreads, setMaxThreads] = useState(0);
    // 是否使用CUDA
    const [useCuda, setUseCuda] = useState(false);
    // 是否使用CoreML
    const [useCoreML, setUseCoreML] = useState(false);
    // 硬件可用性状态
    const [hardwareAvailability, setHardwareAvailability] = useState({
        'cuda available': false,
        'coreML available': false
    });
    // 硬件检测加载状态
    const [hardwareLoading, setHardwareLoading] = useState(true);

    //------------------------初始化函数-------------------------

    // 检测硬件可用性
    const checkHardwareAvailability = async () => {
        try {
            setHardwareLoading(true);
            console.log('开始检测硬件可用性...');

            // 调用 getAvailableHardware
            await window.getAvailableHardware();

            // 获取更新后的设置
            const updatedSettings = await window.getSettings();
            console.log('硬件检测结果:', updatedSettings.performance);

            if (updatedSettings.performance) {
                setHardwareAvailability({
                    'cuda available': updatedSettings.performance['cuda available'] || false,
                    'coreML available': updatedSettings.performance['coreML available'] || false
                });
            }

        } catch (error) {
            console.error('硬件检测失败:', error);
            message.error('硬件检测失败，使用默认设置');
            // 使用来自props的备用数据或默认值
            setHardwareAvailability({
                'cuda available': performanceSettings?.['cuda available'] || false,
                'coreML available': performanceSettings?.['coreML available'] || false
            });
        } finally {
            setHardwareLoading(false);
        }
    };

    // 初始化硬件检测
    useEffect(() => {
        checkHardwareAvailability();
    }, []);

    // 初始化性能设置
    useEffect(() => {
        if (performanceSettings) {
            setMaxThreads(performanceSettings.maxThreads || 0);
            setUseCuda(performanceSettings.useCuda || false);
            setUseCoreML(performanceSettings.useCoreML || false);

            // 如果没有进行硬件检测，使用传入的硬件可用性信息
            if (!hardwareLoading) {
                setHardwareAvailability({
                    'cuda available': performanceSettings['cuda available'] || false,
                    'coreML available': performanceSettings['coreML available'] || false
                });
            }
        }
    }, [performanceSettings, hardwareLoading]);

    // 添加调试信息
    useEffect(() => {
        console.log('Performance props:', {
            onSaveAllSettings: typeof onSaveAllSettings,
            onSavePerformanceSettings: typeof onSavePerformanceSettings,
            isSaving,
            hardwareAvailability,
            hardwareLoading
        });
    }, [onSaveAllSettings, onSavePerformanceSettings, isSaving, hardwareAvailability, hardwareLoading]);

    //------------------------处理函数-------------------------

    // 处理最大线程数变化
    const handleMaxThreadsChange = (e) => {
        const value = parseInt(e.target.value) || 0;
        setMaxThreads(value);
    };

    // 处理CUDA开关变化
    const handleCudaChange = (checked) => {
        if (!hardwareAvailability['cuda available'] && checked) {
            message.warning('CUDA不可用，无法启用');
            return;
        }
        setUseCuda(checked);
    };

    // 处理CoreML开关变化
    const handleCoreMlChange = (checked) => {
        if (!hardwareAvailability['coreML available'] && checked) {
            message.warning('CoreML不可用，无法启用');
            return;
        }
        setUseCoreML(checked);
    };

    // 处理保存性能设置
    const handleSavePerformanceSettings = () => {
        if (onSavePerformanceSettings) {
            const performanceSettingsToSave = {
                maxThreads: maxThreads,
                useCuda: useCuda,
                useCoreML: useCoreML,
                'cuda available': hardwareAvailability['cuda available'],
                'coreML available': hardwareAvailability['coreML available']
            };
            onSavePerformanceSettings(performanceSettingsToSave);
        }
    };

    // 保存所有设置的函数
    const handleSaveAllSettings = async () => {
        console.log('Performance - handleSaveAllSettings called');

        try {
            if (onSaveAllSettings) {
                // 构建当前页面的性能设置数据
                const currentPerformanceSettings = {
                    performance: {
                        maxThreads: maxThreads,
                        useCuda: useCuda,
                        useCoreML: useCoreML,
                        // 包含硬件可用性信息
                        'cuda available': hardwareAvailability['cuda available'],
                        'coreML available': hardwareAvailability['coreML available']
                    }
                };

                console.log('Performance - 保存数据:', currentPerformanceSettings);
                // 调用父组件的保存函数，传递当前页面数据
                await onSaveAllSettings(currentPerformanceSettings);

            } else {
                console.log('onSaveAllSettings 函数不可用，使用本地保存');
                handleSavePerformanceSettings();
            }
        } catch (error) {
            console.error('保存性能设置失败:', error);
            message.error('保存性能设置失败');
        }
    };

    // 重新检测硬件
    const handleRefreshHardware = () => {
        checkHardwareAvailability();
        message.info('正在重新检测硬件...');
    };

    // 深色主题配置
    const darkTheme = {
        token: {
            colorBgContainer: '#333333',
            colorText: '#ffffff',
            colorBorder: '#555555',
            colorBgElevated: '#2a2a2a',
            colorTextHeading: '#ffffff',
            colorPrimary: '#00ffff',
        },
        components: {
            Button: {
                colorPrimary: '#00ffff',
                colorPrimaryHover: '#33ffff',
                colorPrimaryActive: '#00cccc',
            },
            Input: {
                colorBgContainer: '#333333',
                colorText: '#ffffff',
                colorBorder: '#555555',
                colorPrimaryHover: '#33ffff',
                colorPrimary: '#00ffff',
            },
            Switch: {
                colorPrimary: '#00ffff',
                colorPrimaryHover: '#33ffff',
                trackColorToggled: '#00ffff',
            },
        },
    };

    return (
        <div className="performance-settings-container">
            {/* 最大线程数设置 */}
            <div className="performance-section">
                <div className="performance-settings-explanation">
                    <h4>线程配置</h4>
                    <p>设置ONNX运行时的最大线程数</p>
                </div>
                <div className="performance-demo-container">
                    <div className="performance-setting-display">
                        <div className="performance-setting-label">
                            <span>最大线程数：</span>
                        </div>
                        <div className="performance-setting-input-wrapper">
                            <ConfigProvider theme={darkTheme}>
                                <Input
                                    type="number"
                                    value={maxThreads}
                                    onChange={handleMaxThreadsChange}
                                    min={0}
                                    placeholder="0表示使用最大可用线程数"
                                    className="performance-setting-input"
                                    suffix="线程"
                                />
                            </ConfigProvider>
                        </div>
                    </div>
                    <div className="performance-setting-hint">
                        <span>0 表示使用最大可用线程数，建议设置为 0 或 CPU 核心数</span>
                    </div>
                </div>
            </div>

            {/* 分隔线 */}
            <div className="section-divider"></div>

            {/* CUDA设置 */}
            <div className="performance-section">
                <div className="performance-settings-explanation">
                    <h4>CUDA 加速</h4>
                    <p>使用NVIDIA GPU进行计算加速</p>
                    {hardwareLoading && <p style={{ color: '#999999', fontSize: '12px' }}>正在检测硬件...</p>}
                </div>
                <div className="performance-demo-container">
                    <div className="performance-setting-display">
                        <div className="performance-setting-label">
                            <span>启用 CUDA：</span>
                        </div>
                        <div className="performance-setting-switch-wrapper">
                            <ConfigProvider theme={darkTheme}>
                                <Switch
                                    checked={useCuda}
                                    onChange={handleCudaChange}
                                    disabled={!hardwareAvailability['cuda available'] || hardwareLoading}
                                    className="performance-setting-switch"
                                    loading={hardwareLoading}
                                />
                            </ConfigProvider>
                            <span className="performance-availability-status">
                                {hardwareLoading ? '检测中...' :
                                    hardwareAvailability['cuda available'] ? '可用' : '不可用'}
                            </span>
                        </div>
                    </div>
                    <div className="performance-setting-hint">
                        <span>需要NVIDIA GPU和CUDA驱动支持，启用后可显著提升计算性能</span>
                    </div>
                </div>
            </div>

            {/* 分隔线 */}
            <div className="section-divider"></div>

            {/* CoreML设置 */}
            <div className="performance-section">
                <div className="performance-settings-explanation">
                    <h4>CoreML 加速</h4>
                    <p>使用Apple CoreML进行计算加速</p>
                    {hardwareLoading && <p style={{ color: '#999999', fontSize: '12px' }}>正在检测硬件...</p>}
                </div>
                <div className="performance-demo-container">
                    <div className="performance-setting-display">
                        <div className="performance-setting-label">
                            <span>启用 CoreML：</span>
                        </div>
                        <div className="performance-setting-switch-wrapper">
                            <ConfigProvider theme={darkTheme}>
                                <Switch
                                    checked={useCoreML}
                                    onChange={handleCoreMlChange}
                                    disabled={!hardwareAvailability['coreML available'] || hardwareLoading}
                                    className="performance-setting-switch"
                                    loading={hardwareLoading}
                                />
                            </ConfigProvider>
                            <span className="performance-availability-status">
                                {hardwareLoading ? '检测中...' :
                                    hardwareAvailability['coreML available'] ? '可用' : '不可用'}
                            </span>
                        </div>
                    </div>
                    <div className="performance-setting-hint">
                        <span>仅在macOS系统上可用，启用后可利用Apple Neural Engine加速</span>
                    </div>
                </div>
            </div>

            {/* 分隔线 */}
            <div className="section-divider"></div>

            {/* 保存按钮和硬件刷新 */}
            <div className="performance-controls-container">
                <div className="performance-action-buttons">
                    <ConfigProvider theme={darkTheme}>
                        <Button
                            type="default"
                            onClick={handleRefreshHardware}
                            loading={hardwareLoading}
                            size="small"
                            className="refresh-hardware-button"
                            title="重新检测硬件"
                        >
                            {hardwareLoading ? '检测中...' : '刷新硬件'}
                        </Button>
                    </ConfigProvider>
                </div>
                <div className="performance-save-button-container">
                    <ConfigProvider theme={darkTheme}>
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={handleSaveAllSettings}
                            loading={isSaving}
                            size="small"
                            className="save-settings-button"
                            title="保存设置"
                        >
                            保存设置
                        </Button>
                    </ConfigProvider>
                </div>
            </div>
        </div>
    );
};

export default Performance;