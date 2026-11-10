// Ratings. Each browser keeps a secret player id; the server hands back a public one to show others.
// Results go in through pafo_report, which only moves ratings once a player from each side has sent
// the same final score. Nothing here is fatal: if the rating server cannot be reached, games are
// simply unrated.
import { getClient } from './net.js';

let pid = null, prof = null;
try { pid = localStorage.getItem('pafo-pid'); if (!/^[0-9a-f-]{36}$/.test(pid || '')) { pid = crypto.randomUUID(); localStorage.setItem('pafo-pid', pid); } } catch (e) { pid = crypto.randomUUID(); }
async function rpc(fn, args) {
  const client = await getClient();
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data;
}
export const profile = () => prof;
export async function me(name) { prof = await rpc('pafo_me', { p_pid: pid, p_name: name }); return prof; }
export const ratings = pubs => rpc('pafo_ratings', { p_pubs: pubs });
export const leaderboard = () => rpc('pafo_leaderboard', {});
export async function report(match, home, away, sh, sa) {
  const r = await rpc('pafo_report', { p_pid: pid, p_match: match, p_home: home, p_away: away, p_sh: sh, p_sa: sa });
  if (r && r.applied && prof) prof.rating = r.rating;
  return r;
}
