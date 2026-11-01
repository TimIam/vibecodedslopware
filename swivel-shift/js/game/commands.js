// Menu commands (the original's File / Game menus, MENU 128..130, plus web additions). The menu bar and
// touch controls post commands; the main menu loop and the game loop run them at safe points, the way the
// original handled menu selections from its event loop.

import { G, Prefs } from './state.js';
import { Input, UIState } from '../core/input.js';
import { Hooks, register } from './hooks.js';
import { refreshMusic } from './music.js';
import { stopAllSounds } from './sound.js';

const queue = [];

// Settings toggles take effect immediately; everything else waits for the game to pick it up
export function postCommand(name) {
  switch (name) {
    case 'music': Prefs.music = !Prefs.music; Hooks.savePrefs(); refreshMusic(); return;
    case 'sound': Prefs.soundOff = !Prefs.soundOff; Hooks.savePrefs(); if (Prefs.soundOff) stopAllSounds(); return;
    case 'pause': if (UIState.inGame) Input.capsLock = !Input.capsLock; return;
  }
  if (!queue.includes(name)) queue.push(name);
}

// Which commands make sense right now (for enabling menu items)
export function commandEnabled(name) {
  const idle = UIState.modal === 0, game = UIState.inGame;
  switch (name) {
    case 'abort': case 'saveCheckpoint': return idle && game;
    case 'save': return idle && game && !G.playerDead;
    case 'map': return idle && game && !UIState.paused;
    case 'pause': return game && idle;
    case 'instructions': return idle && !game;
    default: return idle;
  }
}

// where: 'menu' (main menu loop) or 'game' (game loop)
export async function runCommands(where) {
  while (queue.length && UIState.modal === 0) {
    const name = queue.shift();
    if (!commandEnabled(name)) continue;
    if (where === 'menu') {
      switch (name) {
        case 'new': await Hooks.newGame(); break;
        case 'restore': await Hooks.continueGame(null); break;
        case 'quit': await Hooks.quit(); break;
        case 'options': await Hooks.options(); break;
        case 'about': await Hooks.credits(); break;
        case 'instructions': await Hooks.instructions(); break;
      }
      Input.flushEvents();
      continue;
    }
    switch (name) {
      case 'new': case 'restore': case 'quit': case 'abort':
        // leaving the current game: confirm first, then let the main menu run the rest
        if (await Hooks.confirmAbortGame()) {
          G.levelDone = true;
          if (name !== 'abort') queue.unshift(name);
          return;
        }
        break;
      case 'save': await Hooks.doCopierSaveGame(); break;
      case 'saveCheckpoint': await Hooks.doSaveGame(false); break;
      case 'options': await Hooks.options(); break;
      case 'about': await Hooks.credits(); break;
      case 'map': await Hooks.showMap(); G.mapCooldown = 6; break;
    }
    Input.flushEvents();
    G.gf686 = true; G.g46af = true; // redraw the game area
  }
}

register({ runCommands, postCommand });
