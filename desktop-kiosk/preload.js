/**
 * Bridge between the kiosk renderer and the main process.
 *
 * Only these five calls are exposed. The admin token lives in the main process
 * and is never handed to the renderer, so a compromised page can ask for a
 * punch but cannot read or exfiltrate the credential that authorises it.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kiosk', {
  getState:     ()             => ipcRenderer.invoke('kiosk:getState'),
  setServerUrl: (url)          => ipcRenderer.invoke('kiosk:setServerUrl', url),
  signIn:       (creds)        => ipcRenderer.invoke('kiosk:signIn', creds),
  signOut:      ()             => ipcRenderer.invoke('kiosk:signOut'),
  identify:     (payload)      => ipcRenderer.invoke('kiosk:identify', payload),
  punch:        (payload)      => ipcRenderer.invoke('kiosk:punch', payload),
  exit:         ()             => ipcRenderer.invoke('kiosk:exit'),
})
