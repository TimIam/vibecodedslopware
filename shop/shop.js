// The merch page: product grid, product dialog, try-on dialog and cart.
// Prices and variants come from catalog.js; checkout happens on Stripe via /api/shop-checkout,
// and paid orders are sent to Printful by /api/shop-webhook.

import { DESIGNS, KINDS, GARMENTS, SIZES, SHIPPING, MAX_QTY, unitPrice, shippingFor, money } from "./catalog.js";
import { productCanvas } from "./garment.js";
import { TryOn } from "./tryon.js";

const CART_KEY = "slopware.cart.v1";
const $ = (s, root = document) => root.querySelector(s);

function h(tag, props = {}, kids = []) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

// ------------------------------------------------------------------ design images
const images = new Map();
function designImage(id) {
  if (!images.has(id)) {
    const img = new Image();
    img.src = `designs/${id}.png`;
    images.set(id, img.decode().then(() => img));
  }
  return images.get(id);
}

// ------------------------------------------------------------------ state
const firstColor = (garment) => Object.keys(GARMENTS[garment].colors)[0];
const pick = { design: DESIGNS[0].id, garment: "tee", color: firstColor("tee"), size: "L", qty: 1 };
const hexOf = (p) => GARMENTS[p.garment].colors[p.color].hex;

let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]").filter((l) => GARMENTS[l.garment]?.colors[l.color] && DESIGNS.some((d) => d.id === l.design)); } catch { cart = []; }
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} renderCart(); };

let region = "us";
let shopOpen = null;   // null = still asking, true/false once /api/shop-checkout answers

// ------------------------------------------------------------------ grid
function renderGrid() {
  const wrap = $("#grid");
  wrap.replaceChildren();
  for (const [kind, label] of Object.entries(KINDS)) {
    const grid = h("div", { className: "grid" });
    wrap.append(h("section", { ariaLabel: label }, [h("h2", { className: "section-title", textContent: label }), grid]));
    for (const d of DESIGNS.filter((x) => x.kind === kind)) grid.append(card(d));
  }
}

function card(d) {
  const cv = h("canvas", { width: 500, height: 600, className: "mock", role: "img", ariaLabel: `${d.title} tee` });
  const el = h("article", { className: "item" }, [
    h("button", { className: "item-open", type: "button", ariaLabel: `${d.title}: choose a size and color`, onclick: () => openProduct(d.id) }, [cv]),
    h("div", { className: "item-text" }, [
      h("h3", { textContent: d.title }),
      h("p", { className: "item-blurb", textContent: d.blurb }),
      h("p", { className: "item-price", textContent: `Tee ${money(GARMENTS.tee.price)} · Hoodie ${money(GARMENTS.hoodie.price)}` }),
    ]),
    h("div", { className: "item-actions" }, [
      h("button", { className: "btn", type: "button", textContent: "Choose", onclick: () => openProduct(d.id) }),
      h("button", { className: "btn ghost", type: "button", textContent: "Try it on", onclick: () => { selectDesign(d.id); openTryOn(); } }),
    ]),
  ]);
  designImage(d.id).then((img) => productCanvas(cv, "tee", GARMENTS.tee.colors[firstColor("tee")].hex, img));
  return el;
}

function selectDesign(id) {
  pick.design = id;
}

// ------------------------------------------------------------------ option pickers (shared by both dialogs)
function garmentPicker(onChange) {
  return h("div", { className: "seg", role: "radiogroup", ariaLabel: "Garment" }, Object.entries(GARMENTS).map(([key, g]) =>
    h("button", { type: "button", role: "radio", ariaChecked: String(pick.garment === key), textContent: `${g.name} ${money(g.price)}`, onclick: () => {
      pick.garment = key;
      if (!GARMENTS[key].colors[pick.color]) pick.color = firstColor(key);
      onChange();
    } })));
}

function colorPicker(onChange) {
  return h("div", { className: "swatches", role: "radiogroup", ariaLabel: "Color" }, Object.entries(GARMENTS[pick.garment].colors).map(([name, c]) =>
    h("button", { type: "button", role: "radio", className: "swatch", title: name, ariaLabel: name, ariaChecked: String(pick.color === name), style: `--c:${c.hex}`, onclick: () => { pick.color = name; onChange(); } })));
}

// ------------------------------------------------------------------ product dialog
const productDlg = $("#product");
async function openProduct(id) {
  selectDesign(id);
  renderProduct();
  productDlg.showModal();
}

async function renderProduct() {
  const d = DESIGNS.find((x) => x.id === pick.design);
  const g = GARMENTS[pick.garment];
  const body = $(".product-body", productDlg);
  const cv = h("canvas", { width: 800, height: 960, className: "mock big", role: "img", ariaLabel: `${d.title} ${g.name.toLowerCase()} in ${pick.color}` });
  const rerender = () => renderProduct();
  const sizeSel = h("div", { className: "sizes", role: "radiogroup", ariaLabel: "Size" }, SIZES.map((s) =>
    h("button", { type: "button", role: "radio", ariaChecked: String(pick.size === s), textContent: s, onclick: () => { pick.size = s; rerender(); } })));
  const qty = h("input", { type: "number", min: 1, max: MAX_QTY, value: pick.qty, id: "qty", onchange: () => { pick.qty = Math.max(1, Math.min(MAX_QTY, Math.round(Number(qty.value)) || 1)); qty.value = pick.qty; } });
  const extra = g.upcharge[pick.size];
  body.replaceChildren(
    h("div", { className: "product-pic" }, [cv]),
    h("div", { className: "product-info" }, [
      h("h2", { id: "product-title", textContent: d.title }),
      d.game ? h("a", { href: d.game, className: "game-link", textContent: "Play the game →" }) : h("span"),
      h("p", { textContent: d.blurb }),
      garmentPicker(rerender),
      h("p", { className: "label", textContent: `Color: ${pick.color}` }),
      colorPicker(rerender),
      h("p", { className: "label", textContent: "Size" }),
      sizeSel,
      h("div", { className: "buy-row" }, [
        h("label", { htmlFor: "qty", textContent: "Qty" }), qty,
        h("span", { className: "price", textContent: money(unitPrice(pick.garment, pick.size)) + (extra ? ` (${pick.size} +${money(extra)})` : "") }),
      ]),
      h("div", { className: "buy-row" }, [
        h("button", { type: "button", className: "btn", textContent: "Add to cart", onclick: () => { addToCart(); productDlg.close(); openCart(); } }),
        h("button", { type: "button", className: "btn ghost", textContent: "Try it on", onclick: () => { productDlg.close(); openTryOn(); } }),
      ]),
      h("p", { className: "fine", textContent: `${g.blank}. Printed when you order by Printful and usually shipped within a week.` }),
    ]),
  );
  productCanvas(cv, pick.garment, hexOf(pick), await designImage(d.id));
}

// ------------------------------------------------------------------ try-on dialog
const tryDlg = $("#tryon");
let tryon = null;
function openTryOn() {
  tryon ??= new TryOn($("#tryon-canvas"), { onStatus: (m) => { $("#tryon-status").textContent = m; } });
  renderTryControls();
  tryDlg.showModal();
  tryon.draw();
}

async function renderTryControls() {
  const box = $("#tryon-pick");
  const rerender = () => renderTryControls();
  const designs = h("select", { ariaLabel: "Design", onchange: () => { pick.design = designs.value; rerender(); } },
    Object.entries(KINDS).map(([kind, label]) => h("optgroup", { label }, DESIGNS.filter((d) => d.kind === kind).map((d) =>
      h("option", { value: d.id, textContent: d.title, selected: d.id === pick.design })))));
  box.replaceChildren(designs, garmentPicker(rerender), colorPicker(rerender));
  tryon.set(pick.garment, hexOf(pick), await designImage(pick.design));
}

$("#tryon-camera").onclick = () => tryon.startCamera();
$("#tryon-file").onchange = (e) => { const f = e.target.files[0]; if (f) tryon.usePhoto(f); e.target.value = ""; };
$("#tryon-size").oninput = (e) => tryon.setSize(Number(e.target.value));
$("#tryon-retrack").onclick = () => { $("#tryon-size").value = 1; tryon.retrack(); };
$("#tryon-save").onclick = async () => {
  if (!tryon.source) return;
  const blob = await tryon.snapshot();
  const a = h("a", { href: URL.createObjectURL(blob), download: `slopware-${pick.design}-fit.png` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$("#tryon-add").onclick = () => { tryDlg.close(); openProduct(pick.design); };
tryDlg.addEventListener("close", () => tryon?.stop());

// ------------------------------------------------------------------ cart
const cartDlg = $("#cart");
function addToCart() {
  const same = cart.find((l) => l.design === pick.design && l.garment === pick.garment && l.color === pick.color && l.size === pick.size);
  if (same) same.qty = Math.min(MAX_QTY, same.qty + pick.qty);
  else cart.push({ design: pick.design, garment: pick.garment, color: pick.color, size: pick.size, qty: pick.qty });
  saveCart();
}

function openCart() { renderCart(); cartDlg.showModal(); }

function renderCart() {
  const count = cart.reduce((n, l) => n + l.qty, 0);
  $("#cart-count").textContent = count;
  const list = $("#cart-lines");
  list.replaceChildren();
  if (!cart.length) list.append(h("p", { className: "empty", textContent: "Nothing here yet. The slop awaits." }));
  cart.forEach((l, i) => {
    const d = DESIGNS.find((x) => x.id === l.design);
    const cv = h("canvas", { width: 120, height: 144, className: "thumb" });
    const qty = h("input", { type: "number", min: 0, max: MAX_QTY, value: l.qty, ariaLabel: `Quantity of ${d.title}`, onchange: () => {
      const q = Math.max(0, Math.min(MAX_QTY, Math.round(Number(qty.value)) || 0));
      if (q === 0) cart.splice(i, 1); else l.qty = q;
      saveCart();
    } });
    list.append(h("div", { className: "line" }, [
      cv,
      h("div", {}, [h("strong", { textContent: d.title }), h("span", { textContent: `${GARMENTS[l.garment].name} · ${l.color} · ${l.size}` })]),
      qty,
      h("span", { className: "price", textContent: money(unitPrice(l.garment, l.size) * l.qty) }),
      h("button", { type: "button", className: "x", ariaLabel: `Remove ${d.title}`, textContent: "×", onclick: () => { cart.splice(i, 1); saveCart(); } }),
    ]));
    designImage(l.design).then((img) => productCanvas(cv, l.garment, GARMENTS[l.garment].colors[l.color].hex, img, { pad: 0.02 }));
  });
  const sub = cart.reduce((n, l) => n + unitPrice(l.garment, l.size) * l.qty, 0);
  const ship = shippingFor(region, count);
  $("#cart-sub").textContent = money(sub);
  $("#cart-ship").textContent = count ? money(ship) : "—";
  $("#cart-total").textContent = money(sub + ship);
  const go = $("#checkout");
  go.disabled = !count || shopOpen !== true;
  go.textContent = shopOpen === false ? "Checkout opens soon" : "Checkout";
  $("#cart-note").textContent = shopOpen === false
    ? "The till isn't plugged in yet. Your cart will keep until it is."
    : "Secure checkout on Stripe. Prices in USD.";
}

$("#cart-btn").onclick = openCart;
for (const [key, s] of Object.entries(SHIPPING)) $("#region").append(h("option", { value: key, textContent: s.label }));
$("#region").onchange = (e) => { region = e.target.value; renderCart(); };
$("#checkout").onclick = async () => {
  const btn = $("#checkout");
  btn.disabled = true; btn.textContent = "Opening checkout…";
  try {
    const res = await fetch("/api/shop-checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cart, region }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || "Checkout didn't open. Try again in a minute.");
    location.href = data.url;
  } catch (e) {
    $("#cart-note").textContent = e.message;
    btn.disabled = false; btn.textContent = "Checkout";
  }
};

// close any dialog by clicking its backdrop
for (const dlg of document.querySelectorAll("dialog")) {
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
}

// ------------------------------------------------------------------ start
const params = new URLSearchParams(location.search);
if (params.has("paid")) {
  cart = []; saveCart();
  $("#paid").hidden = false;
  history.replaceState(null, "", location.pathname);
}
renderGrid();
renderCart();
fetch("/api/shop-checkout").then((r) => r.json()).then((d) => { shopOpen = !!d.open; }, () => { shopOpen = false; }).finally(renderCart);
