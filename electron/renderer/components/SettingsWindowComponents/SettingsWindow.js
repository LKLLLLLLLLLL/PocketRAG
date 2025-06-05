export function SettingsWindowInit() {
    window.checkSettings = async (settings) => {
        await window.electronAPI.kernelReadyPromise()
        const callbackId = window.callbackRegister(() => {})
        try {
            const result = await new Promise ((resolve, reject) => {
                let timeout
                const listener = (event) => {
                    clearTimeout(timeout)
                    const status = event.detail
                    if(status.code === 'SUCCESS') {
                        resolve('SUCCESS')
                    }
                    else {
                        reject(new Error(status.message))
                    }
                }
                window.addEventListener('checkSettingsResult', listener, {once : true})
                window.electronAPI.checkSettings(callbackId, settings)
                timeout = setTimeout(() => {
                    window.removeEventListener('checkSettingsResult', listener)
                    reject(new Error('checkSettings timeout!'))
                }, window.timeLimit)
            })
            return result
        }catch(err) {
            console.error(err)
            throw err
        }finally {
            window.callbacks.delete(callbackId)
        }
    }

    window.updateSettings = async (settings) => {
        await window.electronAPI.kernelReadyPromise()
        window.electronAPI.updateSettings(settings)
    }

    window.setApiKey = async (modelName, apiKey) => {
        await window.electronAPI.kernelReadyPromise()
        window.electronAPI.setApiKey(modelName, apiKey)
    }

    window.getApiKey = async (modelName) => {
        await window.electronAPI.kernelReadyPromise()
        const callbackId = window.callbackRegister(() => {})
        try {
            const result = await new Promise((resolve, reject) => {
                let timeout
                const listener = (event) => {
                    clearTimeout(timeout)
                    resolve(event.detail)
                }
                window.addEventListener('getApiKeyResult', listener, {once : true})
                window.electronAPI.getApiKey(callbackId, modelName)
                timeout = setTimeout(() => {
                    window.removeEventListener('getApiKeyResult', listener)
                    reject(new Error('getApiKey timeout!'))
                }, window.timeLimit)
            })
            return result
        }catch(err) {
            console.error(err)
            throw err
        }finally {
            window.callbacks.delete(callbackId)
        }
    }

    window.testApi = async (modelName, url, api) => {
        await window.electronAPI.kernelReadyPromise()
        const callbackId = window.callbackRegister(() => {})
        try {
            const result = await new Promise((resolve, reject) => {
                let timeout
                const listener = (event) => {
                    clearTimeout(timeout)
                    const status = event.detail
                    if(status.code === 'SUCCESS') {
                        resolve('SUCCESS')
                    }
                    else {
                        reject(new Error(status.message))
                    }
                }
                window.addEventListener('testApiResult', listener, {once : true})
                window.electronAPI.testApi(callbackId, modelName, url, api)
                timeout = setTimeout(() => {
                    window.removeEventListener('testApiResult', listener)
                    reject(new Error('testApi timeout!'))
                }, window.timeLimit)
            })
            return result
        }catch(err) {
            console.error(err)
            throw err
        }finally {
            window.callbacks.delete(callbackId)
        }
    }
}