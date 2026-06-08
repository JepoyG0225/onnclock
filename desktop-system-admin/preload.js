'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('adminApi', {
  getSummary: () => ipcRenderer.invoke('admin:getSummary'),
})
