import React, { useState, useEffect } from 'react';
import './RightScreen.css';
import { Button, Input, Select, Switch, message, Space } from 'antd';
import { CloseOutlined, PlusOutlined, DeleteOutlined, CheckOutlined, FolderOpenOutlined } from '@ant-design/icons';
import ConversationModelModal from '../ConversationModelModal/ConversationModelModal';
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

    // 设置API Key到数据库 - 通过后端接口安全地存储敏感信息
    const setAPIkey = async (modelName, url, apiKey) => {
        try {
            console.log('RightScreen - setAPIkey 原始调用参数:');
            console.log('  modelName:', modelName, typeof modelName, 'isNull:', modelName === null);
            console.log('  url:', url, typeof url, 'isNull:', url === null);
            console.log('  apiKey:', apiKey, typeof apiKey, 'isNull:', apiKey === null);

            // 严格验证参数 - 确保不是 null 或 undefined
            if (modelName === null || modelName === undefined) {
                throw new Error('模型名称为null或undefined');
            }
            if (url === null || url === undefined) {
                throw new Error('URL为null或undefined');
            }
            if (apiKey === null || apiKey === undefined) {
                throw new Error('API密钥为null或undefined');
            }

            // 验证参数类型
            if (typeof modelName !== 'string') {
                throw new Error(`模型名称类型错误: ${typeof modelName}, 期望: string`);
            }
            if (typeof url !== 'string') {
                throw new Error(`URL类型错误: ${typeof url}, 期望: string`);
            }
            if (typeof apiKey !== 'string') {
                throw new Error(`API密钥类型错误: ${typeof apiKey}, 期望: string`);
            }

            // 验证参数内容
            if (modelName.trim() === '') {
                throw new Error('模型名称不能为空');
            }
            if (url.trim() === '') {
                throw new Error('URL不能为空');
            }
            if (apiKey.trim() === '') {
                throw new Error('API密钥不能为空');
            }

            // 强制转换为字符串并清理
            const cleanModelName = String(modelName).trim();
            const cleanUrl = String(url).trim();
            const cleanApiKey = String(apiKey).trim();

            console.log('RightScreen - setAPIkey 清理后的参数:');
            console.log('  cleanModelName:', cleanModelName, typeof cleanModelName);
            console.log('  cleanUrl:', cleanUrl, typeof cleanUrl);
            console.log('  cleanApiKey:', '***', typeof cleanApiKey);

            // 通过后端接口将API Key安全地存储到数据库
            await window.setApiKey(cleanModelName, cleanApiKey);
            // 测试API连通性
            await window.testApi(cleanModelName, cleanUrl, cleanApiKey);
            
            // 临时存储到组件状态（仅用于UI显示，不保存到settings.json）
            setAPIKey(cleanApiKey);
            message.success(`API Key设置成功: ${cleanModelName}`);
        } catch (err) {
            console.error('设置API Key失败:', err);
            message.error(`设置API Key失败: ${err.message}`);
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
            window.updateSettings(updatedSettings);

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
            window.updateSettings(updatedSettings);

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
            window.updateSettings(updatedSettings);

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
            window.updateSettings(updatedSettings);

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
            window.updateSettings(updatedSettings);

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

            // 简化的保存逻辑：
            // console.log(updatedSettings);
            // 1. 验证设置
            await window.checkSettings(updatedSettings);
            console.log(updatedSettings);
            // 2. 直接保存设置
            await window.updateSettings(updatedSettings);

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

    // 修改 handleConversationModelOk 函数，确保API Key通过后端接口直接写入数据库
    const handleConversationModelOk = async (newModel, apiKey) => {
        try {
            setIsSaving(true);
            console.log('RightScreen - handleConversationModelOk 开始处理');
            console.log('新模型配置:', newModel);
            console.log('API Key类型:', typeof apiKey);

            // 1. 通过后端接口设置API Key到数据库（使用模型的name作为标识）
            console.log('设置API Key到数据库...');
            await setAPIkey(newModel.name, newModel.url, apiKey);

            // 2. 更新本地状态（不保存API Key到settings.json）
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
            message.success('模型添加成功，API Key已安全保存到数据库');

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

    // 处理搜索设置变化
    const handleSearchSettingsChange = (updatedSearchSettings) => {
        // 更新本地搜索设置状态
        setSearchSettings(updatedSearchSettings);
        
        // 同步更新全局设置
        const newSettings = {
            ...settings,
            searchSettings: updatedSearchSettings
        };
        setSettings(newSettings);
    };
    
    // 处理性能设置变化
    const handlePerformanceSettingsChange = (updatedPerformanceSettings) => {
        // 更新本地性能设置状态
        setPerformanceSettings(updatedPerformanceSettings);
        
        // 同步更新全局设置
        const newSettings = {
            ...settings,
            performance: updatedPerformanceSettings
        };
        setSettings(newSettings);
    };

    switch(content){
        case 'localModelManagement':
            return(
                <div className = 'rightscreen-container'>
                    <Header onClick={onClick}></Header>
                    <div className="settings-content-wrapper">
                        <LocalModelManagement
                            localModelManagement={localModelManagement}
                            onSaveAllSettings={handleSaveAllSettings} // 保存所有设置
                            onSaveLocalModelSettings={handleSaveLocalModelSettings}
                            onModelListChange={handleLocalModelListChange}
                            isSaving={isSaving}>
                        </LocalModelManagement>
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
                            onPerformanceSettingsChange={handlePerformanceSettingsChange} // 性能设置变化回调
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
                            onSearchSettingsChange={handleSearchSettingsChange} // 搜索设置变化回调
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