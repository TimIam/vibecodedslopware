import { measureTake } from './yard.js';

self.onmessage = ({ data: { clip, armor } }) => {
  for (let weapon = 0; weapon < 3; weapon++)
    self.postMessage({ weapon, ...measureTake(clip, weapon, armor) });
};
self.postMessage({ ready: true });
