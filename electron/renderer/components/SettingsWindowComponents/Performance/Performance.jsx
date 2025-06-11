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

            // 确保window.getAvailableHardware函数存在
            if (typeof window.getAvailableHardware !== 'function') {
                throw new Error('getAvailableHardware 函数不可用');
            }

            // 调用 getAvailableHardware
            await window.getAvailableHardware();

            // 稍微延迟以确保设置已更新
            await new Promise(resolve => setTimeout(resolve, 500));

            // 获取更新后的设置
            const updatedSettings = await window.getSettings();
            console.log('硬件检测结果:', updatedSettings.performance);

            if (updatedSettings.performance) {
                const newHardwareAvailability = {
                    'cuda available': updatedSettings.performance['cuda available'] || false,
                    'coreML available': updatedSettings.performance['coreML available'] || false
                };

                setHardwareAvailability(newHardwareAvailability);
                console.log('硬件可用性已更新:', newHardwareAvailability);

                // 显示检测结果
                const availableHardware = [];
                if (newHardwareAvailability['cuda available']) availableHardware.push('CUDA');
                if (newHardwareAvailability['coreML available']) availableHardware.push('CoreML');

                if (availableHardware.length > 0) {
                    message.success(`硬件检测完成，可用加速: ${availableHardware.join(', ')}`);
                } else {
                    message.info('硬件检测完成，未检测到可用的硬件加速');
                }
            }

        } catch (error) {
            console.error('硬件检测失败:', error);
            message.warning('硬件检测失败，使用默认设置');

            // 使用来自props的备用数据或默认值
            const fallbackAvailability = {
                'cuda available': performanceSettings?.['cuda available'] || false,
                'coreML available': performanceSettings?.['coreML available'] || false
            };

            setHardwareAvailability(fallbackAvailability);
            console.log('使用备用硬件设置:', fallbackAvailability);

        } finally {
            setHardwareLoading(false);
            console.log('硬件检测流程完成');
        }
    };

    // 初始化硬件检测 - 优化版本
    useEffect(() => {
        // 确保只在组件首次挂载时检测
        if (hardwareLoading) {
            checkHardwareAvailability();
        }
    }, []); // 空依赖数组确保只运行一次

    // 如果想要在performanceSettings变化时重新检测（可选）
    useEffect(() => {
        // 如果performanceSettings从外部更新且包含新的硬件信息，直接使用
        if (performanceSettings && !hardwareLoading) {
            const externalHardwareInfo = {
                'cuda available': performanceSettings['cuda available'],
                'coreML available': performanceSettings['coreML available']
            };

            // 只有当外部硬件信息与当前状态不同时才更新
            if (JSON.stringify(externalHardwareInfo) !== JSON.stringify(hardwareAvailability)) {
                console.log('使用外部硬件信息:', externalHardwareInfo);
                setHardwareAvailability(externalHardwareInfo);
            }
        }
    }, [performanceSettings]); // 移除hardwareLoading依赖避免循环

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
    };    return (
        <div className="performance-settings-container">
            {/* 线程配置 */}
            <div className="settings-group-title">线程配置</div>
            
            {/* 最大线程数设置 */}
            <div className="setting-item">
                <div className="setting-content">
                    <div className="setting-info">
                        <div className="setting-title">最大线程数</div>
                        <div className="setting-description">设置ONNX运行时的最大线程数，0表示使用最大可用线程数</div>
                    </div>
                    <div className="setting-control">
                        <ConfigProvider theme={darkTheme}>
                            <Input
                                type="number"
                                value={maxThreads}
                                onChange={handleMaxThreadsChange}
                                min={0}
                                placeholder="线程数"
                                className="compact-input"
                                suffix="线程"
                            />
                        </ConfigProvider>
                    </div>
                </div>
            </div>

            {/* 硬件加速 */}
            <div className="settings-group-title">硬件加速</div>
            {hardwareLoading && <div className="settings-group-description">正在检测硬件...</div>}
            
            {/* CUDA设置 */}
            <div className="setting-item">
                <div className="setting-content">
                    <div className="setting-info">
                        <div className="setting-title">CUDA 加速</div>
                        <div className="setting-description">使用NVIDIA GPU进行计算加速，需要CUDA驱动支持</div>
                    </div>
                    <div className="setting-control">
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
            </div>

            {/* 分隔线 */}
            <div className="section-divider"></div>            {/* CoreML设置 */}
            <div className="setting-item">
                <div className="setting-content">
                    <div className="setting-info">
                        <div className="setting-title">CoreML 加速</div>
                        <div className="setting-description">使用Apple CoreML进行计算加速，仅在macOS系统上可用</div>
                    </div>
                    <div className="setting-control">
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
            </div>        </div>
    );
};

export default Performance;