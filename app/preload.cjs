'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// This bridge is installed only in the packaged interface, never in the game.
contextBridge.exposeInMainWorld('idleBoard', Object.freeze({
  getState: () => ipcRenderer.invoke('board:state'),
  act: (action, payload = {}) => ipcRenderer.invoke('board:action', action, payload),
  setBounds: bounds => ipcRenderer.send('board:bounds', bounds),
  setOverlay: visible => ipcRenderer.invoke('board:overlay', visible === true),
  onState: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('board:state-update', listener);
    return () => ipcRenderer.removeListener('board:state-update', listener);
  },
}));
