// Small DOM helpers and a promise-based modal.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ask({title, body (node|html), buttons:[{label, value, primary, danger}]}) -> Promise<value>
export function ask({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], dismiss = null }) {
  return new Promise(res => {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    box.append(h('h3', {}, title));
    const b = h('div', { class: 'modal-body' }); if (typeof body === 'string') b.innerHTML = body; else if (body) b.append(body); box.append(b);
    const row = h('div', { class: 'modal-btns' });
    const close = v => { back.remove(); document.removeEventListener('keydown', key); res(v); };
    for (const bt of buttons) row.append(h('button', { class: 'btn' + (bt.primary ? ' primary' : '') + (bt.danger ? ' danger' : ''), onclick: () => close(typeof bt.value === 'function' ? bt.value(box) : bt.value) }, bt.label));
    box.append(row); back.append(box); document.body.append(back);
    const key = e => { if (e.key === 'Escape') close(dismiss); };
    document.addEventListener('keydown', key);
    back.addEventListener('pointerdown', e => { if (e.target === back) close(dismiss); });
    (row.querySelector('.primary') || row.querySelector('button'))?.focus();
  });
}
export const confirmDel = (what) => ask({ title: 'Delete?', body: `<p>Delete <b>${esc(what)}</b>? This can't be undone.</p>`, buttons: [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, danger: true }], dismiss: false });

let toastT = 0;
export function toast(msg, ms = 2600) {
  let t = $('#toast'); if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
export function select(options, value, onchange, attrs = {}) {
  const s = h('select', attrs, options.map(o => h('option', { value: o.value ?? o.id, selected: (o.value ?? o.id) === value }, o.label)));
  s.addEventListener('change', () => onchange(s.value)); return s;
}
export function swatches(colors, value, onpick, map = c => c) {
  const row = h('div', { class: 'swatches' });
  for (const c of colors) row.append(h('button', { class: 'sw' + (c === value ? ' on' : ''), title: c, 'aria-label': c, style: { background: map(c) }, onclick: () => { row.querySelectorAll('.sw').forEach(b => b.classList.remove('on')); row.querySelector(`[title="${c}"]`)?.classList.add('on'); onpick(c); } }));
  return row;
}
export const inchToCm = x => x * 2.54, cmToInch = x => x / 2.54;
export const fmtLen = (inches, units = 'in') => units === 'cm' ? `${Math.round(inches * 2.54)} cm` : inches >= 24 ? `${Math.floor(inches / 12)}′ ${Math.round(inches % 12)}″` : `${inches.toFixed(1)}″`;
