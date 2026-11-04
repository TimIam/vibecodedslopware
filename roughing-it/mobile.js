// Roughing It on a phone: the side panel's map, baggage, journal and settings become slide-up
// sheets behind floating buttons (see the max-width:700px block in index.html). The map button
// carries a live thumbnail of the journey map; the journal button shows a dot for new entries.
'use strict';
(() => {
  const body = document.body;
  const close = () => { delete body.dataset.sheet; };
  const open = name => {
    body.dataset.sheet = name;
    if (name === 'journal') document.querySelector('.fab[data-sheet=journal]').classList.remove('new');
  };
  document.querySelectorAll('.fab').forEach(b => b.addEventListener('click', () => body.dataset.sheet === b.dataset.sheet ? close() : open(b.dataset.sheet)));
  document.getElementById('sheetShade').addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  // a close button on each sheet
  document.querySelectorAll('.sheet').forEach(s => { const x = document.createElement('button'); x.className = 'sheetClose'; x.setAttribute('aria-label', 'Close'); x.textContent = '✕'; x.onclick = close; s.style.position = s.style.position || ''; s.prepend(x); });
  // closing the sheet whenever the story moves on keeps the page uncluttered
  const page = document.getElementById('page');
  new MutationObserver(() => { if (body.dataset.sheet && body.dataset.sheet !== 'map') close(); }).observe(page, { childList: true });
  // journal dot
  const journal = document.getElementById('journal'), jfab = document.querySelector('.fab[data-sheet=journal]');
  let lastFirst = '';
  new MutationObserver(() => { const f = journal.firstElementChild ? journal.firstElementChild.textContent : ''; if (f && f !== lastFirst && body.dataset.sheet !== 'journal') jfab.classList.add('new'); lastFirst = f; }).observe(journal, { childList: true });
  // live map thumbnail
  const map = document.getElementById('map'), thumb = document.getElementById('mapThumb'), tg = thumb.getContext('2d');
  tg.imageSmoothingEnabled = false;
  setInterval(() => { if (getComputedStyle(thumb).display !== 'none') tg.drawImage(map, 0, 0, thumb.width, thumb.height); }, 300);
})();
