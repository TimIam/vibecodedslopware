// DOM plumbing shared by every mode: layers, subtitles, toasts, modals, fades, the key map.
import { Snd } from './audio.js';

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v); else e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const LAYERS = ['title', 'hudDrive', 'hudScene', 'hudProc'];
export function layers(...on) { for (const id of LAYERS) $('#' + id).classList.toggle('on', on.includes(id)); }
export function playing(b) { document.body.classList.toggle('playing', b); }

// ---- subtitles: say('Dee', 'text', 'dee') ; kinds: dee | pt | by | radio
const subs = [];
export function say(who, text, kind = 'dee', secs) {
  const box = $('#subs');
  const d = el('div', { class: 'sub ' + kind, html: (who ? `<b>${esc(who)}</b>` : '') + esc(text) });
  box.append(d); subs.push(d);
  while (subs.length > 3) subs.shift().remove();
  const life = secs ?? Math.max(3.2, 1.6 + text.length * 0.055);
  setTimeout(() => { d.style.transition = 'opacity .6s'; d.style.opacity = 0; setTimeout(() => { d.remove(); const i = subs.indexOf(d); if (i >= 0) subs.splice(i, 1); }, 650); }, life * 1000);
  return life;
}
export function clearSubs() { for (const s of subs.splice(0)) s.remove(); }

export function toast(text, tone = '', secs = 3.5) {
  const d = el('div', { class: 'toast ' + tone, text }); $('#toasts').append(d);
  setTimeout(() => d.remove(), secs * 1000);
  if (tone === 'bad') Snd.ui('bad'); else if (tone === 'good') Snd.ui('good');
}

export function fade(on, ms = 600) { const f = $('#fade'); f.style.transitionDuration = ms + 'ms'; f.classList.toggle('on', on); return new Promise(r => setTimeout(r, ms + 30)); }
export const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- modals. openModal(id) / closeModal(id); modal(html, buttons) builds a one-off in #generic and resolves with the button id.
const open = new Set();
export function openModal(id) { $('#' + id).classList.add('on'); open.add(id); }
export function closeModal(id) { $('#' + id).classList.remove('on'); open.delete(id); }
export const modalOpen = () => open.size > 0;
export const isOpen = id => open.has(id);
export function modal(html, buttons = [['ok', 'Continue', true]], { wide = false, onBuild } = {}) {
  return new Promise(res => {
    const box = $('#genericBox'); box.style.width = wide ? 'min(1100px,95vw)' : 'min(720px,92vw)';
    box.innerHTML = html;
    const row = el('div', { class: 'row', style: { marginTop: '20px', justifyContent: 'flex-end' } });
    for (const [id, label, pri] of buttons) row.append(el('button', { class: 'btn' + (pri ? ' pri' : ''), text: label, onclick: () => { Snd.ui('click'); closeModal('generic'); res(id); } }));
    if (buttons.length) box.append(row);
    onBuild?.(box, v => { closeModal('generic'); res(v); });
    openModal('generic');
  });
}
document.addEventListener('click', e => { const c = e.target.closest('[data-close]'); if (c) { const m = c.closest('.modal'); if (m) closeModal(m.id); } });

// ---- keys
export const keys = new Set();
const pressHandlers = [];
export function onKey(fn) { pressHandlers.push(fn); return () => { const i = pressHandlers.indexOf(fn); if (i >= 0) pressHandlers.splice(i, 1); }; }
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  for (const fn of [...pressHandlers]) if (fn(e.code, e) === true) break;
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export const fmtClock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
export function setLoad(frac, label) { $('#loadBar').style.width = Math.round(frac * 100) + '%'; if (label) $('#loadLabel').textContent = label; }
export function hideLoad() { $('#loading').classList.add('off'); }
export function showLoad(label) { $('#loading').classList.remove('off'); setLoad(0, label); }
