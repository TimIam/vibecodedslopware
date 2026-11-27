// What the game can ask of the desktop shell: quitting (the title menu's Quit), fullscreen, and Steam achievements.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('slopDesktop', {
  platform: process.platform,
  quit: () => ipcRenderer.send('quit'),
  fullscreen: on => ipcRenderer.send('fullscreen', on),
  achieve: id => ipcRenderer.send('achieve', id),
});
