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
const dateNow = await window.electronAPI.dateNow()

const callbackRegister = (callback) => {
  const callbackId = Date.now() - dateNow
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
      break
    case 'sessionCrushed':
      if(!data.isReply){
        window.electronAPI.sendSessionCrushed(data.message.error)
      }
      else {
        console.error('isReply may be wrong, expected: false, but the result is: ', data)
      }
      break
    case 'beginConversation':
      if(data.isReply){
        if(data.status.code === 'SUCCESS'){
          const conversationEvent = new CustomEvent('conversation', {detail : data.data})
          window.dispatchEvent(conversationEvent)
        }
        else {
          console.error(data.status.message)
        }
      }
      else {
        console.error('isReply may be wrong, expected: true, but the result is: ', data)
      }
      break
    case 'stopConversation':
      if(data.isReply){
        if(data.status.code === 'SUCCESS'){
          callbacks.delete(data.callbackId)
        }
        else {
          console.error(data.status.message)
          callbacks.delete(data.callbackId)
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

    const conversations = new Map()

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

    window.openRepoListWindow = async () => {
      await window.electronAPI.createNewWindow('repoList')
    }

    window.search = async (query, accuracy = false) => {
      await mainWindowPreprocessPromise
      const callbackId = callbackRegister(() => {})
      try{
        const result = await new Promise ((resolve, reject) => {
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
        return err
      } finally {
        callbacks.delete(callbackId)
      }
    }

    window.beginConversation = async (modelName, query) => {
      await mainWindowPreprocessPromise
      const callbackId = callbackRegister((event) => {
        switch(event.detail.type){
          case 'search':
            const conversationSearchEvent = new CustomEvent('conversationSearch', {detail : event.detail.content})
            window.dispatchEvent(conversationSearchEvent)
            break
          case 'annotation':
            const conversationAnnotationEvent = new CustomEvent('conversationAnnotation', {detail : event.detail.content})
            window.dispatchEvent(conversationAnnotationEvent)
            break
          case 'result':
            const conversationResultEvent = new CustomEvent('conversationResult', {detail : event.detail.content})
            window.dispatchEvent(conversationResultEvent)
            break
          case 'answer':
            const conversationAnswerEvent = new CustomEvent('conversationAnswer', {detail : event.detail.content})
            window.dispatchEvent(conversationAnswerEvent)
            break
          case 'doneRetrieval':
            const conversationDoneRetrievalEvent = new CustomEvent('conversationDoneRetrieval', {detail : event.detail.content})
            window.dispatchEvent(conversationDoneRetrievalEvent)
            break
          case 'done':
            const conversationDoneEvent = new CustomEvent('conversationDone', {detail : event.detail.content})
            window.dispatchEvent(conversationDoneEvent)
            window.removeEventListener('conversation', callbacks.get(callbackId))
            callbacks.delete(callbackId)
            break
        }
      })
      const conversationId = Date.now() - dateNow
      window.electronAPI.beginConversation(callbackId, modelName, conversationId, query)
      window.addEventListener('conversation', callbacks.get(callbackId))
    }

    window.stopConversation = async (conversationId) => {
      await mainWindowPreprocessPromise
      const callbackId = callbackRegister(() => {})
      window.electronAPI.stopConversation(callbackId, conversationId)
    }

    // setTimeout(() => {
    //   openRepoListWindow()
    // }, 5000)
    setTimeout(async () => {
      let a = await window.search('三体')
      console.log(a)
    }, 10000);
    break
  

  case 'repoList':
    const repoListWindowPreprocessPromise = Promise.all([kernelReadyPromise])

    window.getRepos = async () => {
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

    window.openRepo = async (repoName) => {
      await repoListWindowPreprocessPromise
      const sessionId = await window.electronAPI.createNewWindow('main')
      window.electronAPI.openRepo(sessionId, repoName)
    }

    window.createRepo = async () =>{
      await repoListWindowPreprocessPromise
      const callbackId = callbackRegister(() => {})
      window.electronAPI.createRepo(callbackId)
    }
    // setTimeout(async () => {console.log(await window.getRepos()); window.createRepo();}, 5000)
    setTimeout(async () => {console.log(await window.getRepos())}, 15000)
    setTimeout(() => {window.openRepo('123')}, 25000)

    break


  case 'settings':
    
}