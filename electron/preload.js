/**
 * جسر آمن بين الواجهة وElectron — طباعة ملصقات بمقاس ثابت
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maktabaDesktop', {
  isDesktop: true,
  printLabels: (payload) => ipcRenderer.invoke('print-labels', payload),
});
