'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('onclock', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getServerUrl: () => ipcRenderer.invoke('app:getServerUrl'),
  getPortalUrl: () => ipcRenderer.invoke('app:getPortalUrl'),
  getIpLocation: () => ipcRenderer.invoke('app:getIpLocation'),
  getUpdateInfo: () => ipcRenderer.invoke('app:getUpdateInfo'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  // Sub-windows
  openLeaves:     () => ipcRenderer.invoke('app:openLeaves'),
  openMessages:   () => ipcRenderer.invoke('app:openMessages'),
  openProfile:    () => ipcRenderer.invoke('app:openProfile'),
  openPayslips:   () => ipcRenderer.invoke('app:openPayslips'),
  openBudgetReq:  () => ipcRenderer.invoke('app:openBudgetReq'),
  openTimeFix:    () => ipcRenderer.invoke('app:openTimeCorrections'),
  getAnnouncements: () => ipcRenderer.invoke('announcements:get'),

  // Leaves
  getLeaves:     ()     => ipcRenderer.invoke('leaves:get'),
  getLeaveTypes: ()     => ipcRenderer.invoke('leaves:getTypes'),
  fileLeave:     (data) => ipcRenderer.invoke('leaves:file', data),

  // Chat / Messages — DMs
  getChatContacts: ()       => ipcRenderer.invoke('chat:contacts'),
  getChatMessages: (userId) => ipcRenderer.invoke('chat:messages', userId),
  sendMessage:     (data)   => ipcRenderer.invoke('chat:send', data),
  markDmRead:      (userId) => ipcRenderer.invoke('chat:markDmRead', userId),

  // Chat — Groups
  getGroups:          ()              => ipcRenderer.invoke('chat:getGroups'),
  getGroupMessages:   (groupId)       => ipcRenderer.invoke('chat:groupMessages', groupId),
  sendGroupMessage:   (groupId, body) => ipcRenderer.invoke('chat:sendGroupMessage', groupId, body),
  markGroupRead:      (groupId)       => ipcRenderer.invoke('chat:markGroupRead', groupId),

  // Profile
  getProfile:    () =>       ipcRenderer.invoke('employees:me'),
  updateProfile: (data) =>   ipcRenderer.invoke('employees:update', data),
  getUserId:     () =>       ipcRenderer.invoke('app:getUserId'),

  // Auth
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:getSession'),

  // Attendance — location is optional { lat, lng, accuracy, address }
  clockIn: (location) => ipcRenderer.invoke('attendance:clockIn', location),
  clockOut: (location) => ipcRenderer.invoke('attendance:clockOut', location),
  getStatus: () => ipcRenderer.invoke('attendance:getStatus'),
  getAttendanceLogs: (limit = 7) => ipcRenderer.invoke('attendance:getLogs', limit),
  getLatestCapture: () => ipcRenderer.invoke('attendance:getLatestCapture'),
  setLocation: (loc) => ipcRenderer.invoke('attendance:setLocation', loc),
  startBreak: () => ipcRenderer.invoke('attendance:startBreak'),
  endBreak:   () => ipcRenderer.invoke('attendance:endBreak'),
  getMyPayslips: () => ipcRenderer.invoke('payroll:getMyPayslips'),
  downloadPayslipPdf: (payslipId) => ipcRenderer.invoke('payroll:downloadPayslipPdf', payslipId),

  // Budget Requisitions
  getBudgetReqs:   ()     => ipcRenderer.invoke('budgetreq:get'),
  submitBudgetReq: (data) => ipcRenderer.invoke('budgetreq:submit', data),

  // Time Corrections
  getTimeCorrections: () => ipcRenderer.invoke('timeCorrections:get'),
  createTimeCorrection: (data) => ipcRenderer.invoke('timeCorrections:create', data),
  cancelTimeCorrection: (id) => ipcRenderer.invoke('timeCorrections:cancel', id),

  // Listen for status updates pushed from main
  onStatusChange: (cb) => {
    ipcRenderer.on('status:update', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('status:update')
  },
  onLog: (cb) => {
    ipcRenderer.on('log', (_e, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('log')
  },
})
