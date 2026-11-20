import { makeRound } from './arena.js';

// Both peers are on the same versioned channel. Send the fighter schema once
// in the application instead of twice in every frame. The host retains full precision.
const fields = Object.keys(makeRound(1, false).p[0]);
const round = (n) => Math.round(n * 10000) / 10000;
export function packState(g) {
  return [
    g.boutId,
    g.round,
    round(g.time),
    g.winner,
    g.event,
    g.serial,
    g.score,
    g.inputAck,
    g.p.map((p) => fields.map((k) => (typeof p[k] === 'number' ? round(p[k]) : p[k]))),
    g.loot
  ];
}
export function unpackState(data) {
  if (!Array.isArray(data) || data.length !== 10) return null;
  const [boutId, round, time, winner, event, serial, score, inputAck, players, loot] = data;
  if (
    !Array.isArray(players) ||
    players.length !== 2 ||
    !players.every((p) => Array.isArray(p) && p.length === fields.length)
  )
    return null;
  return {
    boutId,
    round,
    time,
    winner,
    event,
    serial,
    score,
    inputAck,
    loot,
    solo: false,
    scouting: false,
    p: players.map((row) => Object.fromEntries(fields.map((key, i) => [key, row[i]])))
  };
}
