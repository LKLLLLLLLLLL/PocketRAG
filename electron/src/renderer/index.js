/*************************react preprocess*********************************/
//import react modules
import React from 'react'
import ReactDOM from 'react-dom/client'
import MainWindow from './views/MainWindow/MainWindow.jsx'
import StartWindow from './views/StartWindow/StartWindow.jsx'
import SettingsWindow from './views/SettingsWindow/SettingsWindow.jsx'


// obtain the window type
const urlParams = new URLSearchParams(window.location.search)
const windowType = urlParams.get('windowType')


// select different components based on different window types
const getWindowRenderFunc = () => {
  switch (windowType) {
      case 'main':
        return MainWindow()
      case 'repoList':
        return StartWindow()
      case 'settings':
        return SettingsWindow()
      default:
        return StartWindow()
    }
}


const renderWindow = getWindowRenderFunc()


// render the window
ReactDOM.createRoot(document.getElementById('root')).render(
    renderWindow()
)


/**************electron's render process********************/
const callbacks = new Map()


const callbackRegister = (callback) => {
  const callbackId = Date.now()
  callbacks.set(callbackId, callback)
  return callbackId
}


window.electronAPI.onKernelData((data) => {
  const type = data.message.type
  switch(type) {
    case 'getRepos'://isReply check has been done in main.js 
      if(data.status.code === 'SUCCESS'){
        const getReposResultEvent = new CustomEvent('getReposResult', {detail : data.data.repoList})
        window.dispatchEvent(getReposResultEvent)
      }
      else {
        console.error(data.status.message)
      }
      break
    case 'embeddingStatus':
      if(!data.isReply){
        const embeddingEvent = new CustomEvent('embeddingStatus', {detail : data})
        window.dispatchEvent(embeddingEvent)
      }
      else {
        console.error('isReply may be wrong, expected: false, but the result is: ', data)
      }
      break
    case 'search':
      if(data.isReply){
        if(data.status.code === 'SUCCESS'){
          const searchResultEvent = new CustomEvent('searchResult', {detail : data.data.results})
          window.dispatchEvent(searchResultEvent)        
        }
        else {
          console.error(data.status.message)
        }        
      }
      else {
        console.error('isReply may be wrong, expected: true, but the result is: ', data)
      }
      break
    case 'sessionPrepared':
      if(!data.isReply){
        const sessionPreparedEvent = new CustomEvent('sessionPrepared', {detail : data})
        window.dispatchEvent(sessionPreparedEvent)
      }
      else {
        console.error('isReply may be wrong, expected: false, but the result is: ', data)
      }
  }
})

const openSettingsWindow = async () => {
  await window.electronAPI.createNewWindow('settings')
}

const kernelReadyPromise = window.electronAPI.kernelReadyPromise()
switch(windowType){
  case 'main':
    const repoInitializePromise = new Promise((resolve, reject) => {
      window.electronAPI.onRepoInitialized(() => {
        resolve()
      })
    })
    const sessionPreparedPromise = new Promise((resolve, reject) => {
      const sessionPreparedListener = (event) => {
        window.removeEventListener('sessionPrepared', sessionPreparedListener)
        let reply = event.detail
        reply.isReply = true
        reply.status = {
          code : 'SUCCESS',
          message : ''
        }
        window.electronAPI.sendSessionPreparedReply(reply)
        resolve()
      }
      window.addEventListener('sessionPrepared', sessionPreparedListener)
    })
    const mainWindowPreprocessPromise = Promise.all([repoInitializePromise, sessionPreparedPromise, kernelReadyPromise])

    window.addEventListener('embeddingStatus', (event) => {
      let reply = event.detail
      reply.isReply = true
      reply.status = {
        code : 'SUCCESS',
        message : ''
      }
      window.electronAPI.sendEmbeddingStatusReply(reply)
      const embeddingStatus = {
        filePath : event.detail.message.filePath,
        status : event.detail.message.status
      }
      console.log(embeddingStatus)
      //应添加与react通信的内容
    })

    const openRepoListWindow = async () => {
      await window.electronAPI.createNewWindow('repoList')
    }

    const search = async (query, accuracy = false) => {
      await mainWindowPreprocessPromise
      const callbackId = callbackRegister(() => {})
      try{
        const result = new Promise ((resolve, reject) => {
          let timeout
          const listener = (event) => {
            clearTimeout(timeout)
            resolve(event.detail)
          }
          window.addEventListener('searchResult', listener, {once : true})
          window.electronAPI.search(callbackId, query, accuracy)
          timeout = setTimeout(() => {
            window.removeEventListener('searchResult', listener)
            reject(new Error('search timeout'))
          }, 10000);
        })
        return result
      } catch(err){
        console.error(err)
      } finally {
        callbacks.delete(callbackId)
      }
    }
    // setTimeout(() => {
    //   openRepoListWindow()
    // }, 5000)
    setTimeout(async () => {
      let a = await search('三体')
      console.log(a)
    }, 10000);
    break
  

  case 'repoList':
    const repoListWindowPreprocessPromise = Promise.all([kernelReadyPromise])

    const getRepos = async () => {
      await repoListWindowPreprocessPromise
      const callbackId = callbackRegister(() => {})
      try{
        const repoList = await new Promise((resolve, reject) => {
          let timeout
          const listener = (event) => {
            clearTimeout(timeout)
            resolve(event.detail)
          }
          window.addEventListener('getReposResult', listener, {once : true})
          window.electronAPI.getRepos(callbackId)
          timeout = setTimeout(() => {
            window.removeEventListener('getReposResult', listener)
            reject(new Error('getRepos Failed'))
          }, 3000)
        })
        return repoList          
      } 
      catch(err){
        console.error(err)
      }
      finally {
        callbacks.delete(callbackId)
      }
    }

    const openRepo = async (repoName) => {
      await repoListWindowPreprocessPromise
      const sessionId = await window.electronAPI.createNewWindow('main')
      window.electronAPI.openRepo(sessionId, repoName)
    }

    const createRepo = async () =>{
      await repoListWindowPreprocessPromise
      const callbackId = callbackRegister(() => {})
      window.electronAPI.createRepo(callbackId)
    }
    setTimeout(async () => {console.log(await getRepos())}, 5000)
    createRepo()
    setTimeout(async () => {console.log(await getRepos())}, 15000)
    setTimeout(() => {openRepo('repo')}, 25000)

    break


  case 'settings':
    
}