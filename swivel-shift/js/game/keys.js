// Game actions -> key bindings. Each action has two bindings (Prefs.keys[name] = [primary, secondary]),
// and the on-screen touch controls hold actions directly (Input.actions).

import { Prefs } from './state.js';
import { Input } from '../core/input.js';

export const ACTIONS = ['rotLeft', 'rotRight', 'scoot', 'inch', 'kick', 'switchItem', 'fire', 'map'];

export function actionDown(name) {
  if (Input.actions.has(name)) return true;
  const b = Prefs.keys[name];
  return !!b && b.some((k) => k !== null && k !== undefined && Input.isPressed(k));
}
