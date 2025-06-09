export function MainWindowInit() {
    window.repoInitializePromise = new Promise((resolve, reject) => {
      if(window.repoName !== undefined && window.repoPath !== undefined) {
        resolve()
        return
      }// avoid timing again due to unknown error
      let timeout
      window.electronAPI.onRepoInitialized(() => {
        clearTimeout(timeout)
        resolve()
      })
      timeout = setTimeout(() => {
        reject(new Error('session initialization time out!'))
      }, window.timeLimit)
    }).catch(async (err) => {
      await window.electronAPI.showMessageBoxSync({
        type : 'error',
        title : 'time out',
        message : `${err.message} please restart the window`,
        modal : true
      })
      await window.electronAPI.close()
    })
    window.sessionPreparedPromise = new Promise(async (resolve, reject) => {
      if(await window.electronAPI.isSessionPrepared() === true) {
        resolve()
        return
      }// avoid timing again due to unknown error
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

    window.conversations = new Map()
    window.crashTime = 0

    window.initConversationMap = async () => {
      await window.repoInitializePromise
      const conversationIds = await window.electronAPI.getConversation(window.repoPath)
      for(const conversationId of conversationIds) {
        const conversationPath = await window.electronAPI.pathJoin(window.repoPath, '.PocketRAG', 'conversation', `conversation-${conversationId}.json`)
        window.conversations.set(conversationId, conversationPath)
      }
    }

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
      const embeddingToReactEvent = new CustomEvent('embedding', {detail : embeddingStatus})
      window.dispatchEvent(embeddingToReactEvent)
    })

    window.openRepoListWindow = async () => {
      const hasOpened = await window.electronAPI.repoListCheck()
      if(hasOpened === true){
        return
      }
      await window.electronAPI.createNewWindow('repoList')
    }

    window.search = async (query, accuracy = false) => {
      await window.sessionPreparedPromise
      const callbackId = window.callbackRegister()
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
          }, window.timeLimit)
        })
        return result
      } catch(err){
        console.error(err)
        throw err
      } finally {
        window.callbacks.delete(callbackId)
      }
    }

    window.beginConversation = async (modelName, query, id = undefined) => {
      await window.repoInitializePromise
      await window.sessionPreparedPromise
      const callbackId = window.callbackRegister((event) => {
        console.log(event.detail)
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
            window.removeEventListener('conversation', window.callbacks.get(callbackId))
            window.callbacks.delete(callbackId)
            break
        }
      })
      const conversationId = id ? id : Date.now()
      if(!id)window.conversations.set(conversationId, await window.electronAPI.pathJoin(window.repoPath, '.PocketRAG','conversation',`conversation-${conversationId}.json`))
      window.electronAPI.beginConversation(callbackId, modelName, conversationId, query)
      window.addEventListener('conversation', window.callbacks.get(callbackId))
    }

    window.stopConversation = async (conversationId) => {
      await window.sessionPreparedPromise
      const callbackId = window.callbackRegister()
      window.electronAPI.stopConversation(callbackId, conversationId)
    }

    window.getApiUsage = async () => {
      await window.sessionPreparedPromise
      const callbackId = window.callbackRegister()
      try {
        const apiUsage = await new Promise((resolve, reject) => {
          let timeout 
          const listener = (event) => {
            clearTimeout(timeout)
            resolve(event.detail.apiUsage)
          }
          window.addEventListener('getApiUsageResult', listener, {once : true})
          window.electronAPI.getApiUsage(callbackId)
          timeout = setTimeout(() => {
            window.removeEventListener('getApiUsageResult', listener)
            reject(new Error('getting api usage time out'))
          }, window.timeLimit)
        })
        return apiUsage
      }catch(err) {
        console.error(err)
        throw err
      }finally {
        window.callbacks.delete(callbackId)
      }
    }

    window.getChunksInfo = async () => {
      await window.sessionPreparedPromise
      const callbackId = window.callbackRegister()
      try {
        const chunksInfo = await new Promise((resolve, reject) => {
          let timeout
          const listener = (event) => {
            clearTimeout(timeout)
            resolve(event.detail)
          }
          window.addEventListener('getChunksInfoResult', listener, {once : true})
          window.electronAPI.getChunksInfo(callbackId)
          setTimeout(() => {
            window.removeEventListener('getChunksInfoResult', listener)
            reject(new Error('getChunksInfo timeout!'))
          }, window.timeLimit)
        })
        return chunksInfo
      }catch(err) {
        console.error(err)
        throw err
      }finally {
        window.callbacks.delete(callbackId)
      }
    }
}