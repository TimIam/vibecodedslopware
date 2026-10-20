// Native link keyboard activation must not also trigger a game's global shortcuts.
// Capture before canvas engines that handle keys on window/document.
window.addEventListener('keydown', event => {
  if (event.target.closest?.('.site-topbar a')) event.stopImmediatePropagation();
}, true);
