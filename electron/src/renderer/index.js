/**************electron's render process********************/
import { MainWindowInit } from './components/MainWindowComponents/MainWindow.js'
import { RepoListWindowInit } from './components/StartWindowComponents/RepoListWindow.js'

const urlParams = new URLSearchParams(window.location.search)
window.windowType = urlParams.get('windowType') // obtain the window type
window.callbacks = new Map()
window.dateNow = Date.now()
window.timeLimit = 60000

window.callbackRegister = (callback) => {
  const callbackId = Date.now() - window.dateNow
  window.callbacks.set(callbackId, callback)
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
      break
    case 'sessionCrashed':
      if(!data.isReply){
        window.crashTime++
        if(window.crashTime > 3){
          window.electronAPI.sendSessionCrashed(data.message.error)
        }
        else {
          const sessionCrashedEvent = new CustomEvent('sessionCrashed')
          window.dispatchEvent(sessionCrashedEvent)
          window.sessionPreparedPromise = new Promise((resolve, reject) => {
            let timeout
            const sessionPreparedListener = (event) => {
              clearTimeout(timeout)
              window.removeEventListener('sessionCrashed', sessionCrashedListener)
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
            const sessionCrashedListener = () =>{
              clearTimeout(timeout)
              removeEventListener('sessionPrepared', sessionPreparedListener)
            }
            window.addEventListener('sessionCrashed', sessionCrashedListener, {once : true})
            window.addEventListener('sessionPrepared', sessionPreparedListener)
            timeout = setTimeout(() => {
              window.removeEventListener('sessionCrashed', sessionCrashedListener)
              window.removeEventListener('sessionPrepared', sessionPreparedListener)
              reject(new Error('session preparation time out!'))
            }, window.timeLimit)
          }).catch(async (err) => {
            await window.electronAPI.showMessageBoxSync({
              type : 'error',
              title : 'time out',
              message : `${err} please restart the window`,
              modal : true
            })
            await window.electronAPI.close()
          })
          window.electronAPI.restartSession(window.repoName)
        }
      }
      else {
        console.error('isReply may be wrong, expected: false, but the result is: ', data)
      }
      break
    case 'beginConversation':
      if(data.isReply){
        if(data.status.code === 'SUCCESS'){
          if(data.data){
            const conversationEvent = new CustomEvent('conversation', {detail : data.data})
            window.dispatchEvent(conversationEvent)
          }
          else {
            console.log(data)
            const conversationBeginEvent = new CustomEvent('conversationBegin')
            window.dispatchEvent(conversationBeginEvent)
          }
        }
        else {
          console.error(data.status.message)
          const conversationNetworkErrorEvent = new CustomEvent('networkError', {detail : data.status.message})
          window.dispatchEvent(conversationNetworkErrorEvent)
        }
      }
      else {
        console.error('isReply may be wrong, expected: true, but the result is: ', data)
      }
      break
    case 'stopConversation':
      if(data.isReply){
        if(data.status.code === 'SUCCESS'){
          window.callbacks.delete(data.callbackId)
        }
        else {
          console.error(data.status.message)
          window.callbacks.delete(data.callbackId)
        }
      }
      else {
        console.error('isReply may be wrong, expected: true, but the result is: ', data)
      }
      break
    case 'createRepo': // all checks have been done in main.js
      const createRepoSuccessEvent = new CustomEvent('createRepoSuccess')
      window.dispatchEvent(createRepoSuccessEvent)
      break
    case 'deleteRepo': // all checks have been done in main.js
      const deleteRepoSuccessEvent = new CustomEvent('deleteRepoSuccess')
      window.dispatchEvent(deleteRepoSuccessEvent)
      break
    case 'getApiUsage':
      if(data.isReply){
        if(data.status.code === 'SUCCESS'){
          const getApiUsageResultEvent = new CustomEvent('getApiUsageResult', {detail : data.data})
          window.dispatchEvent(getApiUsageResultEvent)
        }
        else {
          console.error(data.status.message)
        }
      }
      else {
        console.error('isReply may be wrong, expected: true, but the result is: ', data)
      }
      break

  }
})


window.openSettingsWindow = async () => {
  await window.electronAPI.createNewWindow('settings')
}


switch(window.windowType){
  case 'main':
    MainWindowInit()
    // setTimeout(() => {
    //   window.beginConversation('deepseek','PocketRAG是什么')
    // }, 10000);
    // setTimeout(async () => {
    //   let a = await window.getApiUsage()
    //   console.log(a)
    // }, 90000);
    break
  case 'repoList':
    RepoListWindowInit()
    // window.openSettingsWindow()
    break
  case 'settings':
    
}

/*************************react preprocess*********************************/
//import react modules
import React from 'react'
import ReactDOM from 'react-dom/client'
import MainWindow from './views/MainWindow/MainWindow.jsx'
import StartWindow from './views/StartWindow/StartWindow.jsx'
import SettingsWindow from './views/SettingsWindow/SettingsWindow.jsx'
import '@ant-design/v5-patch-for-react-19'
import './index.css'


// select different components based on different window types
const getWindowRenderFunc = () => {
  switch (window.windowType) {
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


