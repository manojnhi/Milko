const { contextBridge, ipcRenderer } = require('electron');

// Renderer ko sirf ek kaam: report HTML se PDF save karna.
contextBridge.exposeInMainWorld('milkoDesktop', {
  savePdf: (html, name, landscape) => ipcRenderer.invoke('milko:save-pdf', { html, name, landscape }),
});
