import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  invoke: (method: string, input: unknown) => ipcRenderer.invoke('api', method, input),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onFlushRequest: (cb: () => Promise<void>) => {
    ipcRenderer.on('app:flush', async () => {
      try {
        await cb()
      } finally {
        ipcRenderer.send('app:flushed')
      }
    })
  }
})
