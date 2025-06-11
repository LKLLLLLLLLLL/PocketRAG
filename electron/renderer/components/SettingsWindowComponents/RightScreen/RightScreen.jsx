import React, { useState, useEffect } from 'react';
import './RightScreen.css';
import { Button, Input, Select, Switch, message, Space } from 'antd';
import { CloseOutlined, PlusOutlined, DeleteOutlined, CheckOutlined, FolderOpenOutlined } from '@ant-design/icons';
import ConversationModelModal from '../ConversationModelModal/ConversationModelModal';
import LocalModelModal from '../LocalModelModal/LocalModelModal';
import About from '../About/About';
import LocalModelManagement from '../LocalModelManagement/LocalModelManagement';
import ConversationSettings from '../ConversationSettings/ConversationSettings';
import Performance from '../Performance/Performance';
import Page from '../Page/Page';
import SearchSettings from '../SearchSettings/SearchSettings';

const { Option } = Select;

export default function RightScreen({ content, onClick }) {
    //全部设置
    const [settings, setSettings] = useState([]);

    //各个设置
    const [conversationSettings, setConversationSettings] = useState([]);//对话
    const [localModelManagement, setLocalModelManagement] = useState([]);//本地模型
    const [performanceSettings, setPerformanceSettings] = useState([]);//性能
    const [searchSettings, setSearchSettings] = useState([]);//搜索
    const [APIKey, setAPIKey] = useState(null);//暂存APIKey

    //保存状态
    const [isSaving, setIsSaving] = useState(false); 

    //版本号
    const [version, setVersion] = useState('v1.0'); // 初始化版本号

    //控制弹窗开关
    const [localModelModal,setLocalModelModal] = useState(false);
    const [conversationModelModal,setConversationModelModal] = useState(false);

    // 获取版本号
    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const data = await window.electronAPI.getVersion();
                setVersion(data);
            } catch (err) {
                console.error('Error fetching version:', err);
            }
        };
        fetchVersion();
    }, []);

    // 获取所有设置信息
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const result = await window.getSettings();
                setSettings(result);
                setConversationSettings(result?.conversationSettings);
                setLocalModelManagement(result?.localModelManagement);
                setPerformanceSettings(result?.performance);
                setSearchSettings(result?.searchSettings);
            } catch (err) {
                console.error('Error fetching settings:', err);
                message.error('加载设置失败');
            }
        };

        fetchSettings();
    }, []);

    // 初始化性能设置
    useEffect(() => {
        const initPerformanceSettings = settings?.performanceSettings || settings?.performance || {};
        setPerformanceSettings(initPerformanceSettings);
    }, [settings]);

    // 初始化检索设置
    useEffect(() => {
        const initSearchSettings = settings?.searchSettings || {};
        setSearchSettings(initSearchSettings);
    }, [settings]);

    // 一次性将所有新设置写入state中
    const handleSettingChange = (path, value) => {
        const newSettings = {...settings};
        const keys = path.split('.');
        let current = newSettings;
        
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
        setSettings(newSettings);
    };

    // 为单个模型设置APIKey，并测试是否有效
    const setAPIkey = async (modelName, url, apiKey) => {
        const temp = apiKey;
        try {
            await window.setApiKey(modelName, apiKey);
            await window.testApi(modelName, url, apiKey);
            setAPIKey(apiKey);
            message.success(`API Key设置成功: ${modelName}`);
        } catch (err) {
            console.error('设置API Key失败:', err);
            message.error(`设置API Key失败: ${err.message}`);
            setAPIKey(temp);
            throw err;
        }
    };

    // 处理模型列表变化
    const handleModelListChange = (updatedModels) => {
        // 更新本地设置状态
        const updatedConversationSettings = {
            ...conversationSettings,
            generationModel: updatedModels
        };
        setConversationSettings(updatedConversationSettings);

        // 同步更新全局设置
        const newSettings = {
            ...settings,
            conversationSettings: updatedConversationSettings
        };
        setSettings(newSettings);
    };

    // 处理历史长度变化
        const handleHistoryLengthChange = (newLength) => {
            // 更新本地设置状态
            const updatedConversationSettings = {
                ...conversationSettings,
                historyLength: newLength
            };
            setConversationSettings(updatedConversationSettings);
    
            // 同步更新全局设置
            const newSettings = {
                ...settings,
                conversationSettings: updatedConversationSettings
            };
            setSettings(newSettings);
        };
    
    // 保存对话模型设置到后端
    const handleSaveModelSettings = async (modelSettingsData) => {
        try {
            setIsSaving(true);

            // 构建完整的设置数据，只更新模型相关设置
            const updatedSettings = {
                ...settings,
                conversationSettings: {
                    ...conversationSettings,
                    generationModel: modelSettingsData.generationModel
                }
            };

            // 调用后端接口保存设置
            await window.checkSettings(updatedSettings);
            await window.updateSettings(updatedSettings);

            // 更新本地状态
            setSettings(updatedSettings);
            setConversationSettings(updatedSettings.conversationSettings);

            message.success('模型设置保存成功');

        } catch (error) {
            console.error('保存模型设置失败:', error);
            message.error(`保存模型设置失败: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // 保存检索设置到后端
    const handleSaveSearchSettings = async (searchSettingsData) => {
        try {
            setIsSaving(true);

            // 构建完整的设置数据
            const updatedSettings = {
                ...settings,
                searchSettings: {
                    ...searchSettings,
                    ...searchSettingsData
                }
            };

            // 调用后端接口保存设置
            await window.checkSettings(updatedSettings);
            await window.updateSettings(updatedSettings);

            // 更新本地状态
            setSettings(updatedSettings);
            setSearchSettings(updatedSettings.searchSettings);

            message.success('检索设置保存成功');

        } catch (error) {
            console.error('保存检索设置失败:', error);
            message.error(`保存检索设置失败: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // 保存性能设置到后端
    const handleSavePerformanceSettings = async (performanceSettingsData) => {
        try {
            setIsSaving(true);

            // 构建完整的设置数据
            const updatedSettings = {
                ...settings,
                performance: {
                    ...performanceSettings,
                    ...performanceSettingsData
                }
            };

            // 调用后端接口保存设置
            await window.checkSettings(updatedSettings);
            await window.updateSettings(updatedSettings);

            // 更新本地状态
            setSettings(updatedSettings);
            setPerformanceSettings(updatedSettings.performance);

            message.success('性能设置保存成功');

        } catch (error) {
            console.error('保存性能设置失败:', error);
            message.error(`保存性能设置失败: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // 保存历史设置到后端
    const handleSaveHistorySettings = async (historySettingsData) => {
        try {
            setIsSaving(true);

            // 构建完整的设置数据，只更新历史相关设置
            const updatedSettings = {
                ...settings,
                conversationSettings: {
                    ...conversationSettings,
                    historyLength: historySettingsData.historyLength
                }
            };

            // 调用后端接口保存设置
            await window.checkSettings(updatedSettings);
            await window.updateSettings(updatedSettings);

            // 更新本地状态
            setSettings(updatedSettings);
            setConversationSettings(updatedSettings.conversationSettings);

            message.success('历史设置保存成功');

        } catch (error) {
            console.error('保存历史设置失败:', error);
            message.error(`保存历史设置失败: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // 保存本地模型设置到后端
    const handleSaveLocalModelSettings = async (localModelSettingsData) => {
        try {
            setIsSaving(true);

            const updatedSettings = {
                ...settings,
                localModelManagement: {
                    ...localModelManagement,
                    ...localModelSettingsData
                }
            };

            await window.checkSettings(updatedSettings);
            await window.updateSettings(updatedSettings);

            setSettings(updatedSettings);
            setLocalModelManagement(updatedSettings.localModelManagement);

            message.success('本地模型设置保存成功');

        } catch (error) {
            console.error('保存本地模型设置失败:', error);
            message.error(`保存本地模型设置失败: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // 修改 handleSaveAllSettings 函数以更好地处理特定设置
    const handleSaveAllSettings = async (specificSettings = null) => {
        try {
            setIsSaving(true);

            let updatedSettings;

            if (specificSettings) {
                // 如果传入了特定设置，智能合并到当前设置中
                updatedSettings = {
                    ...settings
                };

                // 根据传入的设置类型进行智能合并
                if (specificSettings.conversationSettings) {
                    updatedSettings.conversationSettings = {
                        ...conversationSettings,
                        ...specificSettings.conversationSettings
                    };
                }

                if (specificSettings.localModelManagement) {
                    updatedSettings.localModelManagement = {
                        ...localModelManagement,
                        ...specificSettings.localModelManagement
                    };
                }

                if (specificSettings.performance) {
                    updatedSettings.performance = {
                        ...performanceSettings,
                        ...specificSettings.performance
                    };
                }

                if (specificSettings.searchSettings) {
                    updatedSettings.searchSettings = {
                        ...searchSettings,
                        ...specificSettings.searchSettings
                    };
                }

            } else {
                // 否则保存所有当前状态
                updatedSettings = {
                    ...settings,
                    conversationSettings: {
                        ...conversationSettings,
                        generationModel: conversationSettings?.generationModel || [],
                        historyLength: conversationSettings?.historyLength || 0
                    },
                    localModelManagement: {
                        ...localModelManagement,
                        models: localModelManagement?.models || []
                    },
                    performance: {
                        ...performanceSettings,
                    },
                    searchSettings: {
                        ...searchSettings,
                        searchLimit: searchSettings?.searchLimit || 10,
                        embeddingConfig: searchSettings?.embeddingConfig || { configs: [] },
                        rerankConfig: searchSettings?.rerankConfig || { configs: [] }
                    }
                };
            }

            console.log('RightScreen - 准备保存的设置:', updatedSettings);

            // 调用后端接口验证和保存设置
            await window.checkSettings(updatedSettings);
            await window.updateSettings(updatedSettings);

            // 更新所有本地状态
            setSettings(updatedSettings);
            setConversationSettings(updatedSettings.conversationSettings);
            setLocalModelManagement(updatedSettings.localModelManagement);
            setPerformanceSettings(updatedSettings.performance);
            setSearchSettings(updatedSettings.searchSettings);

            message.success('设置保存成功');

            return updatedSettings;

        } catch (error) {
            console.error('保存设置失败:', error);
            message.error(`保存设置失败: ${error.message}`);
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    // 处理添加对话模型
    const handleAddGenerationModel =()=>{
        setConversationModelModal(true);
    }

    // 处理添加本地模型
    const handleAddLocalModel = () => {
        setLocalModelModal(true);
    };

    // 处理本地模型弹窗确认
    const handleLocalModelOk = async (newModel) => {
        try {
            setIsSaving(true);

            // 更新本地模型列表
            const updatedLocalModelManagement = {
                ...localModelManagement,
                models: [
                    ...(localModelManagement?.models || []),
                    newModel
                ]
            };
            setLocalModelManagement(updatedLocalModelManagement);

            // 更新全局settings状态
            const newSettings = {
                ...settings,
                localModelManagement: updatedLocalModelManagement
            };
            setSettings(newSettings);

            // 关闭弹窗
            setLocalModelModal(false);
            message.success('模型添加成功');

        } catch (error) {
            console.error('添加本地模型失败:', error);
            message.error(`添加本地模型失败: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // 处理对话模型弹窗确认
    const handleConversationModelOk = async (newModel, apiKey) => {
        try {
            setIsSaving(true);

            // 1. 设置API Key
            await setAPIkey(newModel.name, newModel.url, apiKey);

            // 2. 更新本地状态
            const updatedConversationSettings = {
                ...conversationSettings,
                generationModel: [
                    ...(conversationSettings?.generationModel || []),
                    newModel
                ]
            };
            setConversationSettings(updatedConversationSettings);

            // 3. 更新全局settings状态
            const newSettings = {
                ...settings,
                conversationSettings: updatedConversationSettings
            };
            setSettings(newSettings);

            // 4. 关闭弹窗
            setConversationModelModal(false);
            message.success('模型添加成功');

        } catch (error) {
            console.error('添加模型失败:', error);
            message.error(`添加模型失败: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // 处理对话模型弹窗取消
    const handleConversationModelCancel = () => {
        setConversationModelModal(false);
    };

    // 处理本地模型弹窗取消
    const handleLocalModelCancel = () => {
        setLocalModelModal(false);
    };

    // 处理本地模型列表变化
    const handleLocalModelListChange = (updatedModels) => {
        const updatedLocalModelManagement = {
            ...localModelManagement,
            models: updatedModels
        };
        setLocalModelManagement(updatedLocalModelManagement);

        const newSettings = {
            ...settings,
            localModelManagement: updatedLocalModelManagement
        };
        setSettings(newSettings);
    };

    // 渲染保存按钮
    const renderSaveButton = () => (
        <div className="settings-save-container">
            <Button 
                type="primary" 
                icon={<CheckOutlined />} 
                onClick={handleSaveAllConversationSettings}
                loading={isSaving}
                color = "cyan"
                variant='solid'
                className="save-button"
            >
                保存
            </Button>
        </div>
    );

    switch(content){
        case 'localModelManagement':
            return(
                <div className = 'rightscreen-container'>
                    <Header onClick={onClick}></Header>
                    <div className="settings-content-wrapper">
                        <LocalModelManagement
                            localModelManagement={localModelManagement}
                            onAddLocalModel={handleAddLocalModel}
                            onSaveAllSettings={handleSaveAllSettings} // 保存所有设置
                            onSaveLocalModelSettings={handleSaveLocalModelSettings}
                            onModelListChange={handleLocalModelListChange}
                            isSaving={isSaving}>
                        </LocalModelManagement>
                        {localModelModal &&
                            <LocalModelModal
                                open={localModelModal}
                                onOk={handleLocalModelOk}
                                onCancel={handleLocalModelCancel}>
                            </LocalModelModal>
                        }
                    </div>
                    {/* 悬浮保存按钮 */}
                    <div className="floating-save-button">
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={handleSaveAllSettings}
                            loading={isSaving}
                            size="small"
                        >
                            保存设置
                        </Button>
                    </div>
                </div>
            )
        case 'conversationSettings':
            return(
                <div className = 'rightscreen-container'>
                    <Header onClick={onClick}></Header>
                    <div className="settings-content-wrapper">
                        <ConversationSettings
                            conversationSettings={conversationSettings}
                            onAddGenerationModel={handleAddGenerationModel}
                            onSaveAllSettings={handleSaveAllSettings} // 保存所有设置
                            onSaveModelSettings={handleSaveModelSettings} // 保存模型设置
                            onSaveHistorySettings={handleSaveHistorySettings} // 保存历史设置
                            onHistoryLengthChange={handleHistoryLengthChange}
                            onModelListChange={handleModelListChange}// 添加模型列表变化回调
                            isSaving={isSaving}>
                        </ConversationSettings>
                        {conversationModelModal && 
                            <ConversationModelModal
                                open={conversationModelModal}
                                onOk={handleConversationModelOk}
                                onCancel={handleConversationModelCancel}></ConversationModelModal>}
                    </div>
                    {/* 悬浮保存按钮 */}
                    <div className="floating-save-button">
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={handleSaveAllSettings}
                            loading={isSaving}
                            size="small"
                        >
                            保存设置
                        </Button>
                    </div>
                </div>
            )
        case 'performance':
            return(
                <div className='rightscreen-container'>
                    <Header onClick={onClick}></Header>
                    <div className="settings-content-wrapper">
                        <Performance
                            performanceSettings={performanceSettings}
                            onSaveAllSettings={handleSaveAllSettings} // 保存所有设置
                            onSavePerformanceSettings={handleSavePerformanceSettings}
                            isSaving={isSaving}>
                        </Performance>
                    </div>
                    {/* 悬浮保存按钮 */}
                    <div className="floating-save-button">
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={handleSaveAllSettings}
                            loading={isSaving}
                            size="small"
                        >
                            保存设置
                        </Button>
                    </div>
                </div>
            )
        case 'page':
            return(
                <div className='rightscreen-container'>
                    <Header onClick={onClick}></Header>
                    <div className="settings-content-wrapper">
                        <Page
                            onSaveAllSettings={handleSaveAllSettings} // 保存所有设置
                            >
                        </Page>
                    </div>
                </div>
            )
        case 'searchSettings':
            return(
                <div className='rightscreen-container'>
                    <Header onClick={onClick}></Header>
                    <div className="settings-content-wrapper">
                        <SearchSettings
                            searchSettings={searchSettings}
                            localModelManagement={settings?.localModelManagement}
                            onSaveAllSettings={handleSaveAllSettings} // 保存所有设置
                            onSaveSearchSettings={handleSaveSearchSettings}
                            isSaving={isSaving}>
                        </SearchSettings>
                    </div>
                    {/* 悬浮保存按钮 */}
                    <div className="floating-save-button">
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={handleSaveAllSettings}
                            loading={isSaving}
                            size="small"
                        >
                            保存设置
                        </Button>
                    </div>
                </div>
            )
        case 'about':
        default:
            return(
                <div className='rightscreen-container'>
                    <Header onClick={onClick}></Header>
                    <div className="settings-content-wrapper">
                        <About 
                            version={version}
                            onSaveAllSettings={handleSaveAllSettings} // 保存所有设置
                        >
                        </About>
                    </div>
                </div>
            )
    }

}

const Header = ({onClick})=>{
    return(
        <div className='rightscreen-header'>
            <div className='rightscreen-close-button-container'>
                <Button
                    variant='text'
                    color='default'
                    onClick={onClick}
                    icon={<CloseOutlined style= {{color: 'white'}}></CloseOutlined>}
                    className='rightscreen-close-button'>
                </Button>
            </div>
        </div>
    )
}