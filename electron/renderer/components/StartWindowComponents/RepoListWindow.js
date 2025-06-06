export function RepoListWindowInit() {
    window.getRepos = async () => {
      await window.electronAPI.kernelReadyPromise()
      const callbackId = window.callbackRegister()
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
          }, window.timeLimit)
        })
        return repoList          
      } 
      catch(err){
        console.error(err)
        throw err
      }
      finally {
        window.callbacks.delete(callbackId)
      }
    }

    window.openRepo = async (repoName, repoPath) => {
      await window.electronAPI.kernelReadyPromise()
      const hasopened = await window.electronAPI.openRepoCheck(repoName)
      if(hasopened === true) {
        await window.electronAPI.close()
        return
      }
      const sessionId = await window.electronAPI.createNewWindow('main')
      window.electronAPI.openRepo(sessionId, repoName, repoPath)
    }

    window.createRepo = async () => {
      await window.electronAPI.kernelReadyPromise()
      window.electronAPI.createRepo()
    }

    window.deleteRepo = async (repoName) => {
      await window.electronAPI.kernelReadyPromise()
      const repoOpened = await window.electronAPI.deleteRepoCheck(repoName)
      if(repoOpened === true) {
        return
      }
      window.electronAPI.deleteRepo(repoName)
    }

}