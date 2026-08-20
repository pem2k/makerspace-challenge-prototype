const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("remy", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getCalendarStatus: () => ipcRenderer.invoke("calendar:get-status"),
  connectGoogleCalendar: () => ipcRenderer.invoke("calendar:connect"),
  disconnectGoogleCalendar: () => ipcRenderer.invoke("calendar:disconnect"),
  syncGoogleCalendar: () => ipcRenderer.invoke("calendar:sync"),
  onCalendarStatus: (callback) => ipcRenderer.on("calendar:status", (_event, status) => callback(status)),
  previewReminder: () => ipcRenderer.invoke("reminder:preview"),
  openSettings: () => ipcRenderer.invoke("window:open-settings"),
  completeReminder: () => ipcRenderer.invoke("reminder:complete"),
  snoozeReminder: () => ipcRenderer.invoke("reminder:snooze"),
  onReminder: (callback) => ipcRenderer.on("reminder:show", (_event, reminder) => callback(reminder)),
  onPetWave: (callback) => ipcRenderer.on("pet:wave", callback),
});
