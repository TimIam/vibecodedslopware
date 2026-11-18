// Each nine runs the same local 1–9 simulation. Only the scorecard uses 10–18.
export const backNine = new URLSearchParams(globalThis.location?.search).get('nine') === 'back';
export const holeNumber = i => i + (backNine ? 9 : 0);
export const saveKey = backNine ? 'pftc-save-back' : 'pftc-save';
export function courseUrl(back, room) {
  const url = new URL(location.href);
  if (back) url.searchParams.set('nine', 'back'); else url.searchParams.delete('nine');
  if (room && room !== 'mountain') url.searchParams.set('room', room.toUpperCase()); else url.searchParams.delete('room');
  return url;
}
