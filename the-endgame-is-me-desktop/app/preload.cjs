// What the game can ask of the desktop shell: quitting (the title menu's Quit) and fullscreen.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('slopDesktop', {
  platform: process.platform,
  quit: () => ipcRenderer.send('quit'),
  fullscreen: on => ipcRenderer.send('fullscreen', on),
});
