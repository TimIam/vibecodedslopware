// What the shop sells. Shared by the page (shop/shop.js) and the checkout API (api/shop-checkout.js),
// so prices are only ever read from here, never from the browser.
//
// Designs are rendered from the games' art by `node tools/shop-designs.mjs`:
// shop/print/<id>.png is the 3600×4800 file Printful prints, shop/designs/<id>.png the 900×1200 preview.
// Variant ids are Printful catalog variants (GET https://api.printful.com/products/71 and /146, no token needed).
// Prices are in cents.

// kind sorts the page into sections: game art, screenshots in a desktop window, prop sheets of 3D models.
export const KINDS = { art: "Game art", shot: "Screenshots", props: "Prop sheets" };

export const DESIGNS = [
  { id: "slopware", kind: "art", title: "Vibe Coded Slopware", game: null, blurb: "The house logo. Made with vibes, shipped with bugs." },
  { id: "splash", kind: "art", title: "Slopware 16-Bit", game: null, blurb: "The studio splash from the start of every game, sunglasses and all. 100% hand-prompted." },
  { id: "boss-hours", kind: "art", title: "Boss Hours", game: null, blurb: "The raid boss, facing you. You are the encounter." },
  { id: "pit-crew", kind: "art", title: "Pit Crew '26", game: "/pit-crew/", blurb: "The Brightwater car and the crew's motto." },
  { id: "space-bear", kind: "art", title: "Orbital", game: "/pour-decisions/", blurb: "The bear astronaut regular from Pour Decisions. Gravity is a lot tonight." },
  { id: "mycelium", kind: "shot", title: "MYCELIUM.EXE", game: "/mycelium/", blurb: "A real screenshot of Mycelium. I am the fungus." },
  { id: "par-for-the-curse", kind: "shot", title: "PAR4THECURSE.EXE", game: "/par-for-the-curse/", blurb: "A stubby golfer lining up a shot on Mount Bogey. Fore!!!" },
  { id: "bear-run", kind: "shot", title: "BEARRUN.EXE", game: "/bear-run/", blurb: "Skiing downhill with something on your tail." },
  { id: "craps", kind: "shot", title: "CRAPS.EXE", game: "/craps/", blurb: "The 3D craps table, mid-roll. Seven out." },
  { id: "peel-out", kind: "shot", title: "PEELOUT.EXE", game: "/peel-out/", blurb: "The pizza kitchen. Pies stay on the peel. Mostly." },
  { id: "roughing-it", kind: "shot", title: "ROUGHINGIT.EXE", game: "/roughing-it/", blurb: "Pixel-art steamboat from the Mark Twain trail game. Go west." },
  { id: "quarterly-rollout", kind: "shot", title: "QUARTERLY.EXE", game: "/quarterly-rollout/", blurb: "A floor of the office-chair action game. Swivel hard." },
  { id: "bonsai", kind: "shot", title: "BONSAI.EXE", game: "/bonsai/", blurb: "The desk bonsai. Water me." },
  { id: "matrix-rain", kind: "shot", title: "RAIN.SCR", game: "/matrix/", blurb: "The screensaver for every monitor. Wake up." },
  { id: "fell-swoop", kind: "shot", title: "FELLSWOOP.EXE", game: "/fell-swoop/", blurb: "First-person tree chopping in a dark forest. Timber!" },
  { id: "strange-weather", kind: "shot", title: "WEATHER.EXE", game: "/strange-weather/", blurb: "The Strange Weather title screen. Look up." },
  { id: "projection-mayhem", kind: "shot", title: "PROJECTION.EXE", game: "/projection-mayhem/", blurb: "Now showing at the Paper Street Picture House." },
  { id: "madame-haiku", kind: "shot", title: "MADAMEHAIKU.EXE", game: "/psychic/", blurb: "The 16-bit fortune teller. Ask the cards." },
  { id: "safe-water", kind: "shot", title: "SAFEWATER.EXE", game: "/safe-water/", blurb: "The study at Quarry Farm, where the puzzle adventure starts." },
  { id: "mount-bogey", kind: "props", title: "Mount Bogey", game: "/par-for-the-curse/", blurb: "Goose, windmill, golf cart, cannon, trophy and blimp: the hazards of Par for the Curse." },
  { id: "binding-order", kind: "props", title: "Binding Order", game: "/binding-order/", blurb: "A padlock, a deadbolt, a hook and a tension wrench, drawn as a blueprint." },
  { id: "picture-house", kind: "props", title: "Paper Street", game: "/projection-mayhem/", blurb: "The 35mm projector, popcorn, film cans and soda from Projection Mayhem." },
  { id: "timberline", kind: "props", title: "Timberline", game: "/timberline/", blurb: "Harvester, chainsaw, axe and wedge from the tree felling sim." },
  { id: "rack-and-ruin", kind: "props", title: "Rack & Ruin", game: "/demolition/", blurb: "A rack, a GPU server, a UPS and a CRAC unit, waiting to be demolished." },
];

export const SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

export const GARMENTS = {
  tee: {
    name: "Tee",
    blank: "Bella + Canvas 3001 unisex tee, 100% ring-spun cotton",
    price: 2800,
    upcharge: { "2XL": 200, "3XL": 400 },
    colors: {
      "Black":             { hex: "#0c0c0c", v: { S: 4016, M: 4017, L: 4018, XL: 4019, "2XL": 4020, "3XL": 5295 } },
      "Navy":              { hex: "#212642", v: { S: 4111, M: 4112, L: 4113, XL: 4114, "2XL": 4115, "3XL": 12874 } },
      "Heather Forest":    { hex: "#425040", v: { S: 8488, M: 8489, L: 8490, XL: 8491, "2XL": 8492, "3XL": 8493 } },
      "Maroon":            { hex: "#721d37", v: { S: 4106, M: 4107, L: 4108, XL: 4109, "2XL": 4110, "3XL": 15792 } },
      "Dark Grey Heather": { hex: "#3e3c3d", v: { S: 8460, M: 8461, L: 8462, XL: 8463, "2XL": 8464, "3XL": 8465 } },
    },
  },
  hoodie: {
    name: "Hoodie",
    blank: "Gildan 18500 heavy blend hoodie, 50/50 cotton-poly",
    price: 5200,
    upcharge: { "2XL": 200, "3XL": 400 },
    colors: {
      "Black":        { hex: "#0b0b0b", v: { S: 5530, M: 5531, L: 5532, XL: 5533, "2XL": 5534, "3XL": 5535 } },
      "Navy":         { hex: "#131928", v: { S: 5594, M: 5595, L: 5596, XL: 5597, "2XL": 5598, "3XL": 5599 } },
      "Forest Green": { hex: "#222e1f", v: { S: 20570, M: 20571, L: 20572, XL: 20573, "2XL": 20574, "3XL": 20575 } },
      "Maroon":       { hex: "#47171c", v: { S: 5586, M: 5587, L: 5588, XL: 5589, "2XL": 5590, "3XL": 5591 } },
      "Dark Heather": { hex: "#47484d", v: { S: 10806, M: 10807, L: 10808, XL: 10809, "2XL": 10810, "3XL": 10811 } },
    },
  },
};

// Flat shipping charged at checkout, a little over Printful's own rates. The shopper picks a region in the
// cart and checkout only accepts addresses there, so nobody picks "US" and ships to Australia.
export const SHIPPING = {
  us: { label: "United States", first: 600, each: 250, countries: ["US"] },
  world: {
    label: "Everywhere else", first: 1500, each: 400,
    countries: ["CA", "GB", "IE", "AU", "NZ", "DE", "FR", "NL", "BE", "LU", "AT", "CH", "DK", "SE", "NO", "FI", "ES", "PT", "IT", "PL", "CZ", "JP"],
  },
};

export const MAX_QTY = 10;

export function unitPrice(garment, size) {
  const g = GARMENTS[garment];
  return g.price + (g.upcharge[size] ?? 0);
}

// Checks one cart line ({ design, garment, color, size, qty }) against the catalog.
// Returns the Printful variant id and the price, or null if anything doesn't match.
export function resolveLine(line) {
  const design = DESIGNS.find((d) => d.id === line?.design);
  const g = GARMENTS[line?.garment];
  const color = g?.colors[line?.color];
  const variant = color?.v[line?.size];
  const qty = Number(line?.qty);
  if (!design || !variant || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return null;
  return { design, garment: g, variant, qty, unit: unitPrice(line.garment, line.size) };
}

export function shippingFor(region, count) {
  const s = SHIPPING[region];
  return count > 0 ? s.first + s.each * (count - 1) : 0;
}

export const money = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
