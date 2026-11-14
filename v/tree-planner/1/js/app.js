import { Builder } from './builder.js';
import { Room } from './room.js';
import { Importer } from './importer.js';
import { loadCustoms, loadPapers } from './store.js';
import { $, $$ } from './ui.js';

const app = window.__tp = {
  tab: 'builder',
  show(t) {
    app.tab = t;
    $$('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    $$('main > section').forEach(s => s.hidden = s.id !== 'tab-' + t);
    history.replaceState(null, '', '#' + t);
    if (t === 'builder') { app.builder.resize(); app.builder.drawTopdown(); }
    if (t === 'room') { app.room.layout(); app.room.solve?.call(app.room); }
  },
};
$$('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => app.show(b.dataset.tab)));

await Promise.all([loadCustoms().catch(() => { }), loadPapers().catch(() => { })]);
app.builder = new Builder($('#tab-builder'), app);
app.room = new Room($('#tab-room'), app);
app.importer = new Importer($('#tab-ornaments'), app);
// room.solve needs a photo; guard the tab hook
const solve = app.room.solve.bind(app.room); app.room.solve = () => app.room.st && solve();
app.show(['room', 'builder', 'ornaments'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'room');
