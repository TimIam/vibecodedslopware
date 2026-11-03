// Builds craps/index.html from tools/craps-artifact.html.
// The artifact file is the one source: it is published as-is as a claude.ai artifact (multiplayer through
// claude.use("room")), and this script wraps it in the site's page shell and nav for vibecodedslopware.com
// (multiplayer through Supabase Realtime). Run: node tools/build-craps.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./craps-artifact.html', import.meta.url), 'utf8');
// Drop the artifact's own <title> and viewport-fit meta; the shell below carries the page's head.
const body = src.replace(/^<title>[^<]*<\/title>\s*\n/, '').replace(/^<meta name="claude:viewport-fit-sides"[^>]*>\s*\n/, '');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Craps (DEMO)</title>
<meta name="description" content="A multiplayer 3D casino craps table. Bet on the felt, set the dice, then pick them up with a physical hand and flick them at the back wall.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎲</text></svg>">
<link rel="stylesheet" href="/site-nav.css">
<style>body{margin:0}img{max-width:100%}</style>
</head>
<body>
<nav class="site-topbar" aria-label="Site">
  <a class="site-home" href="/" aria-label="Vibe Coded Slopware home">← <span class="site-long">vibe coded </span>slopware</a>
  <a class="site-coffee" href="https://buymeacoffee.com/twilliamja0" target="_blank" rel="noopener" aria-label="Support my streams via Buy Me a Coffee (opens in a new tab)" title="Support my streams on Buy Me a Coffee"><span aria-hidden="true">☕</span> Support<span class="site-long"> my streams</span></a>
</nav>
<script src="/site-nav.js"></script>
${body.trimEnd()}
</body>
</html>
`;
writeFileSync(new URL('../craps/index.html', import.meta.url), page);
console.log(`craps/index.html: ${page.length} bytes`);
