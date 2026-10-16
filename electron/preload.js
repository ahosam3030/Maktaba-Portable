const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maktabaDesktop', {
  isDesktop: true,
  printLabels: (payload) => ipcRenderer.invoke('print-labels', payload),
  printLabelsTspl: (payload) => ipcRenderer.invoke('print-labels-tspl', payload),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
});
