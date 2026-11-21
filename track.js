// First-party download and store-click counter for vibecodedslopware.com.
// Sends {t, u} to /api/track when someone clicks a site download or a store link. No cookies, no
// storage, no identifiers; the server keeps only a per-day count (see api/track.js). Does nothing
// when the browser asks not to be tracked (Global Privacy Control or Do Not Track).
(() => {
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || !navigator.sendBeacon) return;
  const FILE = /\.(zip|exe|scr|dmg|msi|appimage|pkg|7z|tar\.gz)$/i;
  const STORE = /(^|\.)itch\.io$|^store\.steampowered\.com$|^store\.epicgames\.com$|^(www\.)?curseforge\.com$|^github\.com$/i;
  const send = (t, u) => {
    try { navigator.sendBeacon("/api/track", new Blob([JSON.stringify({ t, u })], { type: "text/plain" })); } catch (e) { /* never block the click */ }
  };
  const onClick = (e) => {
    if (e.type === "auxclick" && e.button !== 1) return;
    const a = e.target instanceof Element && e.target.closest("a[href]");
    if (!a) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin === location.origin && FILE.test(url.pathname)) send("d", url.pathname);
    else if (url.protocol === "https:" && STORE.test(url.hostname)) send("o", url.origin + url.pathname);
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
})();
