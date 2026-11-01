# UPTIME: Garage to Hyperscale — Final Design v3 (build from this)

One person, a Craigslist rack, a garage; then a glowing hyperscale campus. The 3D hall filling with lit racks *is* the progress bar. Three meters (power, cooling, network) rotate which one bites as each server tier arrives, a three-card contract board lets you pick which bottleneck you would rather have, incidents are amber racks you tap in the hall, and the first big beat is a **$1,000,000 valuation** at about minute 26, which unlocks the Exit.

Every number below came out of `econ_sim.js` (node, greedy competent player, 1 s steps, 2 taps/s to 2:00, all five stages, contracts, incidents, events, uptime, offline, perks and Exits). The sim with the v3 patch set folded in is the tuning authority; its output tables are committed next to this doc (§19). Rerun it after any table change.

## 0. What changed in v3 (the critique pass)

1. **Arc de-compressed.** Per-tier server growth (1.07 → 1.12 by tier), a flatter $/s ladder from the GPU Node up, globals ×1.25, upgrade costs that track the stack, stage moves and rack bases scaled to the income they arrive under. Stages now last 10-25 minutes instead of 4.
2. **Uptime is a proportional cost, not a death spiral.** Falls `(1 − efficiency)` per second, recovers 1/s, floor 0.5.
3. **Prestige cycle fixed.** +10% per share, Exit glows at 2× current shares, perk cash is a fixed fraction of the stage move. No softlock on perk starts (tier visibility uses cash too).
4. **Infra growth 1.15** beyond the garage; **rack growth per stage** (1.08 → 1.04) so late halls actually fill.
5. **Offline tapered** (50% for 2 h, 20% after) and only 25% of it counts toward valuation.
6. **Module contract** (§14): `data.js` first, ids are mesh names, one state shape, one event bus, one action list, one save format, one "What an Exit does" table.
7. **Scene simplified:** incidents are per rack, no baked LOD, LEDs are one instanced quad set built from `led_*` empties, Campus is an interior hall with a glass end wall, exit cinematic is two beats, stage swap is a fade. Post chain is RenderPass → Bloom → OutputPass on three 0.180.0.
8. **Garage trimmed** (Blade $100, Subpanel $250, Window AC $160) so the lease lands at 10:39.

## 1. Cadence

- **~10 s:** cash ticks, a row glows affordable, you buy, a sled slides in, LEDs boot. A meter creeps toward amber.
- **~60-120 s:** an **incident**: one rack goes amber in the hall. Tap it within 20 s for `max($5, 20 s of income)`; ignore it and the rack goes dark.
- **~3-5 min:** a meter goes red; cheap fix or save for the big one. A new tier appears greyed at 25% of its price. The contract board rerolls every 5 min of play.
- **~10-25 min (first hour):** a **stage move**; the new footprints appear empty and your racks carry over.
- **~20-40 min:** an **Exit** (first one at ~41 min). **Daily:** offline earnings, a card naming your bottleneck, three incidents waiting.

Measured, greedy player, no events: longest stretch with nothing to buy is 5:01 (saving for the Hall at 48 min in a no-Exit run); every other gap is under 4 min.

## 2. Resources and formulas

- **Cash** — the only spend currency. Format K/M/B/T/Qa/Qi/Sx/Sp/Oc/No/Dc (doubles, no BigInt).
- **Valuation** — this run's lifetime revenue: every cash credit (income, Hustle, bounties, Viral bonus, 25% of offline earnings) **except Refresh refunds**. Never regresses within a run; resets to 0 at Exit.
- **Shares** — prestige currency kept across runs. **+10% income each.**
- **Uptime (0-100)**, starts at 100. `uptimeMult = 0.5 + 0.5·(uptime/100)²`. While any meter is red: falls `(1 − efficiency)·1` per second. While a rack is dark: falls 0.25/s per dark rack (max 1/s) and does not recover. Otherwise recovers +1.0/s. Verified with events on: worst dip to the low 50s, back to 100 inside a minute, Exit 1 at 42:10 vs 41:13 without events (+2%).

Every server draws **kW**, emits that kW as **heat**, and needs **Gbps**. Cooling units remove heat but draw power (PUE made legible). Active contracts scale demand per meter.

```
powerDemand = Σ kW·drawMult^upgrades · Π contract.power + Σ coolingDraw
heatDemand  = Σ kW·drawMult^upgrades · Π contract.heat   · (containment ? 0.85 : 1)
netDemand   = Σ Gbps·drawMult^upgrades · Π contract.net  · (compression ? 0.8 : 1)
u_m         = capacity_m > 0 ? demand_m / capacity_m : 0        (utilisation; demand 0 → u 0)
ratio_m     = u_m > 0 ? 1 / u_m : Infinity
efficiency  = min(ratioP, ratioC, ratioN, 1) ^ 1.5
contractMult = 1 + Σ (mult_i − 1)   over active contracts whose SLA is met (SLA-missed contracts contribute 0)
income/s    = Σ(base $/s · 2^upgrades) · contractMult · efficiency · uptimeMult
              · (1 + 0.10·shares) · 1.25^globals · (1 + 0.01·milestones)
```

**Colour thresholds (one definition, used everywhere):** green `u < 0.80`; amber `0.80 ≤ u ≤ 1.00`; red `u > 1.00`. "Headroom" on a meter = `u < 0.80`. A Buy button turns amber when the resulting `u > 1.00` on any meter ("will overdraw: Power 3.3 / 3.0 kW"). Hall brightness and the "dimmed to N%" line both show `efficiency`, so the player sees one number.

`^1.5` means 10% over on cooling costs 15% of income: amber hurts before red does. `drawMult = 1.3` (each output doubling also raises that tier's kW and Gbps by 30%: "overclocked, runs hot") keeps the meters biting after the mid-game. Measured mean max-utilisation across all runs: 97-99%, so the constraints bind continuously.

## 3. Servers

Cost = `base · growth^boughtThisRun` where `bought` is the run-lifetime count of that tier purchased (Refresh never lowers it). Racks hold 8. A tier is visible (greyed) when its stage is unlocked and `max(run valuation, cash) ≥ 25% of base`; Blade additionally needs 6 Pizza Boxes.

| # | id (= mesh name) | Server | Base | $/s | kW | Gbps | Growth | Payback | Stage | Stresses | LED | Flavor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `srv_pizza_box` | Pizza Box | $15 | 0.10 | 0.25 | 0.05 | 1.07 | 150 s | Garage | space | green #58ff9a | "Dell R610. Has a dent. Fans sound like grief." |
| 2 | `srv_blade` | Blade | $100 | 0.90 | 1.5 | 0.4 | 1.07 | 111 s | Garage | power | cyan #45e6ff | "Sixteen computers pretending to be one." |
| 3 | `srv_gpu_node` | GPU Node | $1,300 | 4.3 | 6 | 1.5 | 1.10 | 302 s | Colo | cooling | ice #cfe9ff | "It is 40% fans by weight." |
| 4 | `srv_storage` | Storage Array | $14,000 | 28 | 8 | 25 | 1.10 | 500 s | Colo | network | ice #cfe9ff | "Everyone's photos. All of them." |
| 5 | `srv_ai_pod` | AI Pod | $160,000 | 160 | 40 | 60 | 1.12 | 1,000 s | Warehouse | power + cooling | orange #ff9b3d | "Arrives on a truck, pre-blinking." |
| 6 | `srv_sled` | Hyperscale Sled | $1.9M | 760 | 120 | 300 | 1.12 | 2,500 s | Hall | network | gold #ffd166 | "You no longer buy servers. You buy weather." |
| 7 | `srv_quantum` | Quantum Annealer | $24M | 4,000 | 300 | 500 | 1.12 | 6,000 s | Hall | cooling | magenta #ff5fd2 | "Colder than space. Warmer than the budget." |
| 8 | `srv_orbital` | Orbital Node | $300M | 20,000 | 800 | 2,000 | 1.12 | 15,000 s | Campus | everything | violet-white #d8d0ff | "Latency: one sky." |

Base payback climbs 300 s → 15,000 s from the GPU Node up, which is what keeps the new tier the exciting buy once the multiplier stack (globals × contracts × shares) is applied; the two garage tiers are deliberately quick. kW and Gbps are unchanged from v2, so the meters are untouched. ×1 / ×10 / Max toggles everywhere.

**Upgrades** per tier at 10 / 25 / 50 / 100 / 200 owned: ×2 output, cost = `base × 15 / 75 / 500 / 10,000 / 10,000,000` (roughly 0.6-1.2× what the player has spent on that tier at each threshold), draw ×1.3. Once bought, an upgrade persists even if Refresh drops the owned count below its threshold. Names: Pizza Box firmware, Blade BIOS mod, GPU undervolt (ironic), Dedupe, Pod liquid loop, Sled photonics, Annealer recalibration, Orbital laser link.

**Refresh** (unlocks when every footprint of the stage is bought AND full): tap a rack → swap its lowest tier for the next tier at that tier's current price, refund **25% of the removed tier's base**, slide-out/slide-in. **×10 Refresh** = up to 10 swaps across the tapped rack, then its row neighbours outward, lowest tier first. Density, not quantity, is the game once a hall is full; in the 10 h sim Refresh is 36% of late-run spend.

## 4. Infrastructure

Pricing rule: **one unit carries ~8 servers of the tier that stresses its meter and costs ~25% of those 8 servers' base price.** Cost = `base · growth^owned`. Garage items have caps so the garage strangles you into the lease; garage growth stays 1.25/1.3, everything from the Colo on grows at **1.15** (infra share of spend measured: 29% through the garage, 12-21% at each Exit through the Hall, 12-13% at 2 h in a no-Exit run, 1-8% in the Campus — see risks).

| Meter | Garage | Colo | Warehouse | Hall | Campus |
|---|---|---|---|---|---|
| **Power** | Wall outlet 3 kW (start) · `pwr_pdu` **PDU** +4 kW $60 ×1.25, max 6 · `pwr_subpanel` **Subpanel** +12 kW $250 ×1.3, max 3 ("An electrician named Gus") | `pwr_genset` **Diesel Genset** +60 kW $3,000 | `pwr_substation` **Substation** +500 kW $400k | `pwr_hv_feed` **HV Feed** +2 MW $4.5M | `pwr_smr` **SMR Reactor** +10 MW $750M ("The paperwork is the hard part. The uranium is easy.") |
| **Cooling** | Garage door open 1.5 kW (start) · `cool_box_fan` **Box Fan** +3 kW $30 ×1.25, draws 0.3, max 6 · `cool_window_ac` **Window AC** +8 kW $160 ×1.3, draws 1.5, max 3 | `cool_split_ac` **Split AC** +60 kW $3,000, draws 15 | `cool_crac` **CRAC** +500 kW $350k, draws 125 | `cool_chiller` **Chiller Plant** +2 MW $8M, draws 400 kW · `cool_cryo` **Cryo Plant** +8 MW $120M, draws 2 MW (unlocks at first Annealer) | `cool_immersion` **Immersion Farm** +10 MW $600M, draws 1 MW |
| **Network** | Consumer router 1 Gbps (start) · `net_switch` **Switch** +2 Gbps $30 ×1.25, max 6 · `net_biz_fiber` **Business Fiber** +10 Gbps $500 ×1.3, max 3 | `net_fiber_uplink` **Fiber Uplink** +100 Gbps $10,000 | `net_core_router` **Core Router** +800 Gbps $300k | `net_ix_port` **IX Port** +4 Tbps $6M | `net_cable_landing` **Cable Landing** +25 Tbps $450M ("Your cable has a name now. It is Marjorie.") |

Tapping a meter highlights its **cheapest** fix and its **best-value** fix (`max(capacity added / cost)`) in the shop.

**Placement (lanes).** Each stage defines three lanes as footprint arrays in `data.js`, plus a yard: **power lane** along the left wall, **cooling lane** along the back wall, **network lane** along the right wall, **yard** outside the back wall (visible through the back door / glass). Each infra row has `lane` and the stage has `maxVisible` per lane: garage 6, colo 8, warehouse 12, hall 16, campus 20. Past the cap, the newest unit's badge shows "×N". Rack-mounted gear: `pwr_pdu` mounts on the side of the newest rack (`mount:'rackSide'`), `net_switch` on top of the newest rack (`mount:'rackTop'`). Yard units: `pwr_genset`, `pwr_substation`, `pwr_hv_feed`, `pwr_smr`, `cool_chiller`, `cool_cryo`. Everything else is floor-standing in its lane.

**Efficiency upgrades** (change the math, not the income): `eff_containment` Hot/cold containment: heat ×0.85 ($1,000, Colo); `eff_vsd` Variable-speed fans: every cooling unit's draw ×0.6 ($25k, Warehouse); `eff_compression` Compression: Gbps ×0.8 ($400k, Hall); `eff_economizer` Free-air economizer: cooling capacity ×1.25 ($5M, Hall).

**Mitigations** (one-off, each defuses one event): `mit_ups` UPS $8,000 (grid flicker); `mit_dual_carrier` Dual-carrier $30,000 (fiber cut); `mit_scrubbing` Scrubbing $60,000 (DDoS); `mit_spares` Spares closet $40,000 (incidents flagged `hardware:true` resolve in 5 s).

**Staff** (incidents auto-resolve after `max(2, 20 − 4n)` s; auto-fixes pay no tap bounty — idle safety versus active reward is the player's choice): Dale, your cousin $5,000 ("He has a van.") → Night-shift tech $15,000 → NOC engineer $45,000 → SRE $135,000 → Site Reliability Priest $405,000 ("Blesses the deploys. The deploys are fine now."). Max 5.

## 5. Space, racks and stages

**Rack model.** The Footprints column is the **total** footprints of the stage, indexed `0..N−1` in reading order (row by row, left to right, front row first). Racks owned so far **carry over** on a stage move and occupy footprints `0..k−1`; the remaining footprints are bought one at a time at `rackBase · rackGrowth^(racks bought in this stage)`. The garage's first rack is free. Carried garage racks are repainted white on the Colo move. **A stage move is purchasable once every footprint of the current stage is bought** (not necessarily full). **Refresh requires bought and full.**

| Stage | id | Hall | Footprints (slots) | Layout | Carried + to buy | Move cost | Rack base | Rack growth | New shop items |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `stage_garage` | Garage | 4 (32) | 1 row × 4 | 1 free + 3 | start | $40 | 1.08 | Pizza Box, Blade, PDU, Fan, Switch, Subpanel, Window AC, Business Fiber |
| 2 | `stage_colo` | Strip-mall Colo, Cage 104 | 12 (96) | 2 × 6 | 4 + 8 | $2,000 | $300 | 1.08 | GPU Node, Storage Array, Genset, Split AC, Fiber Uplink, Containment, UPS, Dale |
| 3 | `stage_warehouse` | Warehouse | 36 (288) | 3 × 12 | 12 + 24 | $300,000 | $10,000 | 1.06 | AI Pod, Substation, CRAC, Core Router, VSD fans, Dual-carrier, Scrubbing, Spares |
| 4 | `stage_hall` | Purpose-built Hall | 96 (768) | 4 × 24 | 36 + 60 | $20M | $250,000 | 1.05 | Sled, Annealer, HV Feed, Chiller, Cryo Plant, IX Port, Compression, Economizer |
| 5 | `stage_campus` | Campus, Hall A | 240 (1,920) | 6 × 40 | 96 + 144 | $2B | $10M | 1.04 | Orbital Node, SMR, Immersion Farm, Cable Landing |

Rack pitch 0.8 m along a row; rows 2.4 m apart (alternating cold/hot aisles). Rack 3 in the garage is "Sell the Civic" ($43): the hatchback backs out of frame and two footprints appear. The Colo lease toasts "Mom's not paying the power bill any more."

**Fill, measured** (greedy, no events): Garage 100% lit at 8:46, lease at 10:39; Colo 100% at the Warehouse move (27:01); Warehouse 100% at the Hall move (48:01 no-Exit, 41:13 at Exit 1); Hall 98-100% at every Exit from the Hall and 84/96 racks at 2 h in a no-Exit run; Campus 100% of owned racks at every Campus Exit, 181-224 of 240 footprints bought by hour 10. **Fallback if a playtest misses these:** lower that tier's growth by 0.01 (floor 1.05), then raise the Refresh refund from 25% to 40%.

## 6. Global upgrades

One per decade of valuation, **×1.25 income**, cost = 60% of the threshold: $1K Blanking panels, $10K Cable management ("Zip ties are a love language"), $100K Hot/cold aisle discipline, $1M Monitoring stack, $10M Containerization, $100M Spot market, $1B Custom silicon, $10B Edge PoPs, $100B Sovereign cloud deals, $1T Model hosting, $10T Carbon credits, $100T Orbital uplink, $1Qa Time-share compute, $10Qa Everything-as-a-service, $100Qa Post-scarcity compute. One per decade is the anti-blow-up rule. ×1.5 was tested and re-accelerates the late game (Exit 1 at 31 min, 12 Exits by 2 h); the garage pace is handled by prices instead (§0.8).

## 7. Contracts (the demand side)

Unlocks at Rack 2 (~3:10). The **board** holds three offers; separately you hold **active contracts** in 1 slot (Garage, Colo), 2 slots (Warehouse) or 3 slots (Campus). Taking an offer moves it from the board to a slot and starts its own **10-minute term** of active play; on expiry the slot empties with a toast ("Uncle Ray's term is up. He says thanks.") and no penalty. The board rerolls every **5 minutes of active play** or on manual reroll (costs 30 s of income). "No contract" is a legal choice, and costs you: without contracts the Colo lands at 15:01 and Exit 1 at 1h05 instead of 10:39 and 41:13.

**Stacking.** Income multipliers stack **additively**: `contractMult = 1 + Σ(mult_i − 1)` (County + Weatherbot = ×2.4, County + Halcyon + Ministry = ×4.7). Per-meter demand factors **multiply** (Weatherbot + Halcyon = power ×1.95). An **SLA** contract contributes 0 to the sum (pays base) while uptime is below its bar; SLA is checked per contract every tick. This is where "which bottleneck would you rather have" lives.

| id | Contract | Mult | Power | Heat | Net | SLA | Stage | Line |
|---|---|---|---|---|---|---|---|---|
| `con_uncle_ray` | Uncle Ray's Dental | ×1.15 | 1.0 | 1.0 | 1.0 | — | Garage | "Two CU. He says the site is snappier. You did nothing." |
| `con_minecraft` | Dave's Minecraft (11 boys) | ×1.3 | 1.0 | 1.0 | 1.5 | — | Garage | "They will DDoS each other." |
| `con_frobcoin` | FrobCoin | ×1.5 | 1.2 | 1.4 | 0.5 | — | Garage | "He is loud." |
| `con_county` | County Records Office | ×1.2 | 0.8 | 0.8 | 0.8 | 99 | Colo | "Nothing ever happens. That is the contract." |
| `con_cattube` | CatTube | ×1.8 | 1.0 | 1.0 | 2.5 | 97 | Colo | "Ninety percent of the internet is this." |
| `con_weatherbot` | Weatherbot ML | ×2.2 | 1.3 | 1.3 | 0.7 | 98 | Warehouse | "Series B, burning." |
| `con_black_friday` | Black Friday burst (3 min term) | ×3.0 | 1.2 | 1.2 | 3.0 | — | Warehouse | "Twenty times your traffic, once." |
| `con_halcyon` | Halcyon Labs training run | ×3.0 | 1.5 | 1.5 | 0.5 | 98 | Hall (10+ AI Pods) | "Pays in cash and 'equity'." |
| `con_hyperscaler` | Hyperscaler overflow | ×2.0 | 1.1 | 1.1 | 2.0 | 99 | Hall | "They call it partner capacity." |
| `con_ministry` | A Ministry (unspecified) | ×2.5 | 1.0 | 1.0 | 0.6 | 99.9 | Campus | "They asked for a room with no windows. You have those." |

**Offers:** three distinct contracts allowed at the stage, not currently active, weighted so at least one stresses a meter you have headroom on (`u < 0.80`). Active contracts sit under the meters as chips with their SLA state and term ring. The greedy player's path (FrobCoin → CatTube → County + Weatherbot → Weatherbot + Halcyon) confirms the binding meter rotates as designed.

## 8. Incidents and events

**Incidents** spawn every 60-120 s while active (none offline), from 3:00 in the garage: **one random lit rack goes amber** (all its LEDs, 2 Hz). Tap anywhere on that rack frame within 20 s → green pulse, bounty `max($5, 20 s of income)`. Miss it → the rack goes **dark** (earns nothing, uptime falls and cannot recover) until staff, Spares, or a late tap (no bounty) fixes it. One incident per rack at a time; max 3 outstanding. On phones (or when the rack is off-screen), tapping the **incident badge** focuses the camera on the oldest incident; tapping the badge again fixes it at half bounty.

Flavors (`hardware:true` ones resolve in 5 s with Spares): Disk failing (hw) · Fan seized (hw) · Cert expired · Firmware Tuesday · Mom unplugged the rack to vacuum (hw; garage; later "Cleaner unplugged Rack 7") · Raccoon in the generator (hw) · The colo's tech rebooted the wrong rack (hw) · Halcyon's run went weird (Hall; text only, no strobe). Two texts each.

**Events** (one every 4-6 min while active, Colo onward except the breaker):
- **Heatwave** — cooling capacity ×0.7 for 2 min; the hall tints warm. With the v3 uptime math a 90%-utilisation player loses ~45% income for the two minutes and is back at 100 uptime a minute later; a headroom player barely notices.
- **Grid flicker** — power ×0.8 for 60 s unless UPS, or gensets ≥ 20% of power capacity ("Generators kicked in", +2 uptime).
- **Fiber cut ("a backhoe")** — network ×0.5 for 45 s unless Dual-carrier.
- **DDoS** — network demand ×3 for 60 s unless Scrubbing; the uplink cabinet pulses red, tap it 5 times to scrub by hand.
- **Viral customer** — network demand ×2 for 90 s; if network had headroom when it hit, income ×1.5 for the duration. Rewards slack.
- **AI boom / Crypto bust** — income ×1.5 / ×0.7 for 3 min.
- **Investor visit** — income ×3 for 60 s if uptime ≥ 99, with a 10 s slow orbit. The uptime golden cookie.
- **The breaker (once, garage, scripted)** — fires on the **first tick in the Garage where `powerDemand > powerCapacity`** (any overdraw; no percentage threshold, no float edge). 5 s blackout: hall black except one temporary SpotLight swinging like a phone torch, then toast "Breaker. Just the one; from here on, overdraw dims instead of trips." Sets `account.flags.breakerSeen`; never repeats, never fires in a Colo-or-later perk start (the "Just the One" milestone is simply unavailable there). **Reachability:** "Just the One" is reachable only while a garage-start run is still in the garage (`breakerSeen || (startStage === 1 && stage === 1)`); a player who leases without ever overdrawing loses it for that account until a later garage start, and an account at 3+ shares (Colo starts) that never tripped it never will. Acceptable: it is unavailable there by design.

## 9. Milestones

Each is +1% income (permanent, account level) and a card with a bloom flash, shown once ever; three goal cards (short / mid / long) are always on screen and skip milestones already earned **and milestones this run can no longer reach** (today only "Just the One", §8: it drops off the cards the moment a garage start leases without tripping the breaker). As built: short = the first open milestone in list order; mid = the first open valuation (< $1M), stage, hall-full or megawatt milestone in list order; long = the nearest Exit-line milestone (an Exit count, or a valuation ≥ $1M) by the valuation it takes under the §10 glow rule. In order (ids `ms_*`, snake_case of the name):

Lights On (first server) · It's Getting Warm In Here (cooling amber) · Buy a Fan · Just the One (survive the breaker) · First Gigabit ("The installer asked what the rack was for. You said 'stuff.'") · Fill Rack 1 · Fix 5 Incidents · First Contract ("Uncle Ray would like a receipt.") · $1,000 ("Local man explains Kubernetes on date, is single again.") · Sell the Civic ("212,000 miles. The racks have 99.4%.") · Fill the Garage · Hire Dale · Sign the Lease · 100 Servers · 10 Minutes With No Red · $100,000 · Out of the Cage · First Storage Array · **Make Me a Million** ($1M valuation: row-by-row LED sweep, banner, one-tap screenshot; ticker "LOCAL MAN WORTH $1M ON PAPER, STILL HAS GARAGE SMELL") · Warehouse · First Megawatt · 99.9 for 10 Minutes · First Exit · The Hall · First Sled · Four Nines · First Refresh ("Out with the old. The old was eleven months old.") · Campus ("The garage is a monument now. Interns photograph it.") · Marjorie · First Reactor ("The town is fine with it.") · $1 Trillion · You Are the Cloud ($1Qa soft ending: the investor-orbit camera move with a banner, then the game continues as a pure idle).

About 40 total; the rest count servers (200, 500, 1,000), incidents fixed (25, 100), contracts and Exits.

## 10. Prestige: the Exit

Available at run valuation ≥ $1,000,000. `shares = floor(cbrt(valuation / 1e6))`: $1M → 1, $8M → 2, $27M → 3, $216M → 6, $1.7B → 12, $1T → 100. Each share is **+10% income forever**. The EXIT tab shows: shares you would get, your new multiplier, the perks you would unlock, and "a run this size takes about N minutes from scratch" (sim table baked in). The button is dim and **glows when the new total ≥ max(3, 2 × current shares)**; the tooltip at $1M reads "1 share. Hold to $27M for 3 and the Colo. Analysts suggest holding." Under this rule each Exit needs 8× the previous valuation, which is what keeps late runs from collapsing to minutes.

**Perks** by shares owned (not spent), applied at run start:

| Shares | Perk |
|---|---|
| 1 | $2,500 angel money; garage pre-wired (`cool_box_fan`, `pwr_pdu`, `net_switch` installed) |
| 3 | Start in the Colo with 4 racks and $2,500 |
| 10 | Start in the Warehouse with 12 racks and $100,000 |
| 30 | Start in the Hall with 36 racks and $1,000,000 |
| 100 | Start in the Campus with 96 racks and $20,000,000 |
| 300 | Infrastructure auto-buyer: buys the best-value fix when a meter hits amber (`u ≥ 0.80`) |
| 1,000 | Offline cap 24 h and the 20% tail becomes 50% |

**What an Exit does**

| Scope | Persists (account) | Resets (run) |
|---|---|---|
| Currency | `shares` (+gain) | `cash` → perk money; `valuation` → 0 |
| Progress | `milestones` earned (each +1%, card shown once), `lifetime` stats (servers bought, incidents fixed, contracts held, exits, lifetime valuation), `skyline` count | racks and servers → perk racks, empty; `infra`, `bought`, `upgrades`, `globals`, `effUpgrades`, `mitigations`, `staff` → 0 / none (perk 1 reinstalls the three garage units) |
| Systems | `flags.breakerSeen`, `settings`, ticker recent-lines list | `uptime` → 100, incidents and event cleared, contracts cleared and board rerolled for the new stage, run timer → 0, `noRedSince` → 0 |

Goal cards skip earned milestones, so a Colo-start run's first goals are Hire Dale / $100,000 / Make Me a Million.

**Exit cinematic (2 beats, ~3 s):** LEDs sweep off row by row with a register sound (1.5 s), fade to black (1.5 s), fade up on the new stage with perk gear racked. A new silhouette lights on the skyline. Acquirers rotate: "a company that is legally a shell", "a sovereign wealth fund", "someone Oracle-adjacent".

## 11. Offline

On load `elapsed = min(now − savedAt, 8 h)` (24 h with the 1,000-share perk). Earnings at the saved income and efficiency, **tapered**: `earn = income · (0.5·min(elapsed, 2 h) + 0.2·max(0, elapsed − 2 h))`, so 8 h away pays 2.2 h of income (6.8 h with the perk). `cash += earn`; **`valuation += 0.25·earn`** so a night away does not hand the player an Exit on the return card. No incidents or events spawn offline; contract terms and the board timer pause. Card: "While you were away: +$X in 6h 12m. Bottleneck while you were out: Cooling (92%)." plus, when staff ≥ 1, "Dale kept the lights on." The number counts up over 2 s, LEDs cascade on row by row, then **three incidents spawn** at normal bounty so there is something to tap. Save every 5 s and on `visibilitychange` (§14.7). **Edge cases:** earnings of $0 (no lit server, so no income) produce no card and no return incidents. A hidden tab that comes back (`resume()`, ≥ 60 s away) is treated like a reload: a running event is ended first (quietly, no breaker toast), then the time away is paid at the saved base income (1×, so a hidden investor visit pays 1× and a hidden blackout pays the dimmed income, not $0), and `run.event` is null on return.

## 12. The first ten minutes (sim: 2 taps/s to 2:00; times ±15 s)

- **0:00** Black, then a bulb fades up on one empty rack, a bike, a pegboard, a Civic. $50. A pulsing **Hustle** button ("Answer a ticket", $1). Ticker: "Day 1. You have $50, a rack from Craigslist and your mother's electricity." Goal: Buy a server. Three Pizza Boxes ($15, 16, 17) slide into slots 0-2; LEDs flash white, settle green; "+$0.10/s" floats up each time. Goal: 6 Pizza Boxes.
- **0:16** Boxes 4-6 ($18, 20, 21). Heat 1.50 / 1.50 kW: Cooling amber since box 5, red-edge now. Toast "It's getting warm in here." Blade appears in the shop ($100). $0.60/s.
- **0:35** Box Fan ($30). It spins up on the floor; cooling 4.5 kW, green. Power now 1.8 / 3.0 kW: the fan's 0.3 kW is the first PUE lesson, shown as a tooltip.
- **~1:30** Blade ($100). Buy button was amber: "will overdraw: Power (3.3 / 3.0 kW)." Most players press it. **The breaker.** Five seconds of torch-lit dark, then the hall comes back dimmed to 87% (efficiency 0.91^1.5). $1.50/s nominal.
- **~1:45** PDU ($60). Hall brightens to 100%. Rack 1 is full (6 boxes, 2 blades once the next one lands). Contract card teaser.
- **~2:30** Blade 2 ($107). Network 1.1 / 1.0 Gbps: red, the ceiling tray pulses red. **~2:45** Switch ($30). $2.40/s.
- **3:10** Rack 2 ($40) drops in with a thud and dust. **Contract board opens**: Uncle Ray's Dental ×1.15 / Dave's Minecraft ×1.3 (network ×1.5) / FrobCoin ×1.5 (heat ×1.4). The first real decision; the greedy takes FrobCoin and buys a second fan.
- **~3:00** First incident: Rack 1 goes amber. Tap: green pulse, "+$48". Goal: Fix 5 incidents.
- **3:00-5:00** Blades 3-7, fans, PDUs, a second switch. **4:36** $1,000 valuation, milestone card. **4:54** Pizza Box firmware ($225, 10 boxes): first ×2, and the boxes run 30% hotter.
- **6:18** Blanking panels ($600, first ×1.25 global). $14/s. **6:47** Rack 3 ($43): the Civic backs out of frame. **7:30** Rack 4 ($47). Window AC ($160) and Subpanel ($250) are the first chunky fixes in here.
- **8:46** Garage full: ~15 boxes and ~17 blades across 4 racks, $33/s, valuation ~$5,700. **9:00** Fix 5 Incidents. **10:00** 10 Minutes With No Red.
- **10:39** Lease the Colo ($2,000) at $48/s, valuation $11.4K. One-second fade; the hall comes up on Cage 104 with your four racks, now white, in footprints 0-3 and eight dark outlines behind them. Blade BIOS mod ($1,000) lands at ~14:30, in the Colo: income jumps and every meter lurches amber at once — the "overclocked, runs hot" lesson.

## 13. The arc (sim output, greedy player, glow rule on, no events unless stated)

**Colo (10:39-27:01):** chain-link cage, someone else's dim racks humming beyond. GPU Node at 10:39 (the first thing bought in the cage), a Split AC every ~10 nodes: cooling is the fight. Dale at 14:08. $100K and the first Storage Array at 18:00, a Fiber Uplink every four arrays: network is the fight. **$1,000,000 at 26:06**: sweep, banner, screenshot, EXIT available (dim). Warehouse at 27:01 with the Colo 100% lit.

**Warehouse (27:01-41:13):** AI Pods from 27:01; the $400k Substation and $350k CRAC are the first big saves; First Megawatt 34:15; $10M at 37:30. **$27M at 41:13 — EXIT glows for 3 shares** with the Warehouse 100% full and the $20M Hall sitting in the shop. Infra was 12% of spend. With events on, Exit 1 is 42:10 (+2%). With no contracts ever taken, 1h05.

**Run 2 (Colo start, $2,500, 4 racks):** 25 min to $27M → 6 shares at 1h06. **Run 3 (Colo start):** the Hall at 1h33 (first Sled and Annealer within a minute), $217M → 12 shares at 1h37, Hall 98% lit. **Run 4 (Warehouse start, $100k):** 24 min, $1.7B → 24 shares at 2h00. **Run 5:** 19 min → 48 at 2h20. **Run 6 (Hall start, $1M, 36 racks):** 18.5 min → 96 at 2h38. **Run 7 (Hall start):** the Campus at 2h55, first Orbital, first SMR, Marjorie; $886B → 192 shares at 2h59 with every owned Campus rack lit. $1 Trillion valuation lands in run 8.

**Ten mixed hours** (2 h session + eight 1 h sessions with 8 h gaps): 12 Exits, ~10,300 shares, $6.8T/s, Campus 100% of owned racks lit, 181-224 of 240 footprints bought. Because each Exit needs 8× the valuation, runs stretch back out after hour 3: 34 min, 31 min, then 1h46 and ~4 h, and the $1Qa soft ending lands around active hour 5-6 for a daily player. No run in any scenario was shorter than 8 minutes, and that one was a Campus start that had just doubled its stack. Offline never produces an Exit on its own (25% valuation credit).

**No-Exit 2 h run** (for the player who never presses the button): Hall at 48:01, 84/96 Hall racks and $82.7B at 2 h, Campus at ~2h10, infra 12% of spend, longest no-purchase gap 5:01.

## 14. Module contract (write `data.js` first; all four roles build against it)

### 14.1 Ids
Every row in `data.js` has an `id` that **is the GLB object name** the scene instantiates: tiers `srv_*` (§3), infra `pwr_* / cool_* / net_*` (§4), stages `stage_*`, props `prop_*`, contracts `con_*`, milestones `ms_*`, efficiency `eff_*`, mitigations `mit_*`, events `ev_*`, incidents `inc_*`. Tiers that share geometry (`srv_pizza_box`/`srv_blade`, `srv_ai_pod`/`srv_sled`) and infra that shares geometry (`cool_chiller`/`cool_cryo` from the CRAC body; `net_core_router`/`net_ix_port`/`net_cable_landing` from the fiber cabinet) are **separate objects in Blender sharing one mesh datablock**, each with its own name and node scale, so the scene never maps or guesses. Each tier row carries `led: {color, family}`; the envelope is fixed (§16).

```js
// data.js (shape; values from §3-§10)
export const TIERS   = [{ id:'srv_pizza_box', name, base, inc, kw, gbps, growth, stage, led:{color:0x58ff9a}, needBoxes?, flavor }, …];
export const INFRA   = [{ id:'pwr_pdu', name, meter:'power'|'cooling'|'network', cap, draw?, base, growth, max?, stage, lane:'power'|'cooling'|'network'|'yard', mount?:'rackSide'|'rackTop', needsTier?, flavor }, …];
export const STAGES  = [{ id:'stage_garage', name, footprints:[[x,z,rotY],…], rows, cols, move, rackBase, rackGrowth, lanes:{power:[[x,z,rotY],…], cooling:[…], network:[…], yard:[…]}, maxVisible, slots:1|2|3, shell:'stage_1.glb', fog, keyColor }, …];
export const UPGRADES = { thresholds:[10,25,50,100,200], costMult:[15,75,500,1e4,1e7], drawMult:1.3, names:{[tierId]:string} };
export const GLOBALS  = [{ threshold:1e3, name, mult:1.25 }, …];
export const CONTRACTS, EVENTS, INCIDENTS, MILESTONES, EFFICIENCY, MITIGATIONS, STAFF, PERKS, TICKER;
```

### 14.2 State (sim owns it; scene and ui only read it)
```js
state = {
  v: 1,
  account: { shares, milestones:[msIds], skyline, flags:{ breakerSeen }, lifetime:{ servers, incidents, contracts, exits, valuation },
             settings:{ bloom:true, sound:true }, tickerRecent:[ids], savedAt },
  run: { cash, valuation, uptime, stage:1..5, runTime, noRedSince,
         racks:[{ servers:[tierId|null ×8], dark:false, incident:null|{ id, t0, flavor } }],   // index = footprint index
         racksBoughtThisStage, infra:{ [infraId]:count }, bought:{ [tierId]:n }, upgrades:{ [tierId]:n }, globals:n,
         effUpgrades:[effIds], mitigations:[mitIds], staff:0..5,
         contracts:{ active:[{ id, termLeft }], board:[conIds], boardAge },
         event:null|{ id, tLeft, handled, bonus, taps }, lastIncidentAt, nextIncidentAt, nextEventAt,
         pendingIncidents, pendingIncidentsAt,   // the three §11 return incidents, released by offlineAck()
         seenTiers:[tierIds],                    // §3 reveal is sticky per run: a tier that has shown never blinks out
         uptimeBelow, amberSeen, refreshes, badgeFocus, openingShown, startStage, racksBoughtThisStage }
}
// account also carries session { id, at, gen } (§14.7, the tab that wrote the save) and tickerRecent as [{ id, at }].
```
Derived values (`powerDemand`, capacities, `u_m`, `efficiency`, `income`) are recomputed each tick and exposed read-only as `sim.derived`.

### 14.3 Placement rule
A new server goes into the **lowest-index rack with an empty slot, lowest empty slot first** (slot 0 is the bottom). A new rack occupies the lowest unoccupied footprint index. Refresh swaps in place. Infra units fill their lane array in order; past `maxVisible` the count badges.

### 14.4 Event bus (sim → scene, ui); fixed names, payloads are plain objects
`serverAdded{rack,slot,tier}` · `serverSwapped{rack,slot,from,to}` · `rackAdded{rack}` · `rackDark{rack,dark:bool}` · `infraAdded{id,count}` · `stageChanged{from,to}` · `meters{power:{cap,demand,u},cooling:{…},network:{…},efficiency}` (every tick) · `cash{cash,income,valuation}` (every tick) · `incident{rack,flavor}` · `incidentResolved{rack,bounty}` (0 for late/auto fixes) · `event{id,on:bool}` · `breaker{}` · `upgrade{tier,level}` · `global{n}` · `milestone{id}` · `contractChanged{active,board}` · `exit{shares,gained}` · `offline{summary}` · `refreshAvailable{bool}` · `toast{text,kind}`.

### 14.5 Actions (ui → sim; each returns `{ok, reason?}`)
`buy(id, qty|'max')` (tiers, infra, racks via `'rack'`, stage move via `'move'`, globals via `'global'`, upgrades via `'upg:'+tierId`, efficiency, mitigations, staff via `'staff'`) · `refresh(rack, qty 1|10)` · `tapIncident(rack)` · `tapBadge()` · `hustle()` (garage only, or a hall with no server and no income: the §0.3 no-softlock fallback for a perk start that spent to $0 on racks and infra; the sim exposes `hustleAvailable()` and the ui button follows it) · `pickContract(id)` · `reroll()` · `tapScrub()` · `exit()` · `importSave(str)` · `exportSave()` · `resetRun()` · `setSetting(k,v)` · `offlineAck()` (the §11 return card was dismissed: the three incidents land on the next tick) · `resume()` (a hidden tab came back: credits ≥ 60 s away as a reload would) · `saveNow()` · `claimSave()` ("Play here": take the save back from a newer tab).

### 14.6 Scene API (scene → everyone else)
`scene.pick(x, y) → rackIndex|null` (raycast against rack frames and the uplink cabinet only) · `scene.focus(rack)` · `scene.photo()` · `scene.setBloom(bool)` · `scene.project(rack) → {x,y}` for money pops.

### 14.7 Save
One key `localStorage["uptime_v1"]`, JSON `{ v, account, run }`; `migrate(save)` runs on load and is the only place that knows older shapes (it refuses blobs without a save signature, so an empty paste cannot wipe the account). Save every 5 s and on `visibilitychange`; `account.savedAt` is always wall time. Every save carries `account.session { id, at, gen }` for the tab that wrote it: a tab that finds a newer session in storage pauses and stops saving ("open in another tab") until Exit / reset / import / Play here claims it back; a `storage` event runs that check at once. An unreadable blob is set aside under `uptime_v1_corrupt`. Export/import is the same JSON base64-encoded. `?speed=10` multiplies sim time for playtests; `?reset` clears.

## 15. Visual direction

**Rule:** if a purchase does not change what you see, it is not in the game.

**Camera.** PerspectiveCamera fov 32 (40 portrait). OrbitControls, no pan, azimuth ±45°, polar 30-70°, zoom clamped per stage. Stage change: 1 s fade to black, swap shell and re-fit, 1 s fade up (the only stage transition). Fit = the stage's rack bounding box plus one lane; short axis on portrait, hall laid long-axis toward camera. After 20 s idle, auto-orbit at 0.03 rad/s. **Photo mode** hides the HUD, calls `composer.render()` and `canvas.toBlob()` synchronously in the same frame (no `preserveDrawingBuffer`). Tap vs orbit: travel < 6 px and < 500 ms is a tap, the time measured between the pointer events' own timestamps (not frames, so a rack drop or a GC pause between down and up cannot turn a press into nothing); `touch-action: none`.

**Palette.** Background #07090f, floor #11141b with a faint 1 m grid, concrete #2a2f3a. The garage rack is black steel #1b1f27; from the Colo on, racks are white #d8dcdf. LEDs in **four families** (§3 table) so a mixed hall is not a rainbow: compute green / cyan; data ice-white; AI orange / gold; exotic magenta / violet-white. Incident amber #ffb347, dark red #ff4d4d, cold aisle #3b7bff, hot aisle #ff6a3b.

**Lighting and post.** HemisphereLight (sky #3a4a6a, ground #0b0e14, 0.6) plus one warm key per stage (garage bulb, colo fluorescents, warehouse highbays, hall blue aisle strips, campus moonlight through the glass); no shadow maps; no point lights on servers; exactly one temporary SpotLight for the 5 s breaker beat. FogExp2 0.02 (garage) to 0.0015 (campus). **three 0.180.0**, chain `RenderPass → UnrealBloomPass (strength 0.8, radius 0.35, threshold 0.9) → OutputPass` so ACESFilmic (exposure 1.05) and sRGB are applied; half-res bloom and strength 0.6 on phones; bloom off if fps < 40 for 3 s. Non-LED albedo ≤ 0.6, roughness 0.8, so only emissives bloom.

**Servers and LEDs.** Eight `InstancedMesh` (one per tier, max 1,920 instances each, 240 racks × 8 slots is trivial on a mid laptop; no LOD). One LED `InstancedMesh` of quads (2 per server, ~3,840), `MeshBasicMaterial`, `toneMapped=false`, per-instance colour, positions = rack footprint × slot pitch + the tier's `led_0/led_1` offsets read once from the GLB. Boot: 0.4 s white then tier colour. Running: colour × (0.85 + 0.15·sin(6t + phase)), 10% double-blink each second. Incident: amber 2 Hz square wave on all of that rack's LEDs. Dark: black. Power throttle `efficiency` multiplies every LED, so overdraw dims the whole hall. An upgrade makes that tier pulse brighter for 2 s and blink faster. Fans spin only on standalone units (`cool_box_fan`, `cool_crac`, `cool_tower`), ordinary Meshes, speed ∝ cooling `u`.

**Hall-wide reads, one per meter.** Power: hall brightness = efficiency. Cooling: hot-aisle tiles tint toward #ff6a3b with cooling `u`; fog and hemisphere warm toward #3a1a08 past 1.0. Network: `net_tray_segment` strips above every rack row in every stage (a ceiling cable tray in the garage) scroll a dashed emissive **CanvasTexture** generated at runtime, speed ∝ network `u`, cyan → gold (viral) → red (over). Space: dark footprint outlines and visible empty slots.

**Animation.** Rack drops from +3 m, 0.5 s easeOutBack, dust ring. Server slides in 0.35 s, LEDs boot 0.2 s later. Refresh: out-fade, in-slide. $1M: LEDs sweep row by row. Milestone: bloom strength 1.4 for 0.5 s. Money pops are HTML divs at `scene.project(rack)`. Civic drives out at Rack 3. Exit: two beats (§10). You Are the Cloud: the investor orbit with a banner. **Cut:** rack lerp on stage change, Halcyon magenta strobe, baked LOD, GPU fan children, five-beat exit.

**Scene by stage.** *Garage:* bulb, concrete, pegboard, bike, Civic (leaves at Rack 3), oscillating box fan, dripping window AC, pizza box on the workbench; skyline through the open garage door. *Colo:* you inside chain-link (plane, `alphaMode BLEND`, runtime CanvasTexture diamond pattern), a vending-machine glow, other tenants' dim racks beyond; a window strip only, no skyline. *Warehouse:* trusses, highbays, cable spaghetti, CRACs along the back wall, gensets behind a fence in the yard; skyline through the loading door. *Hall:* raised floor with blue perforated tiles, containment doors, overhead trays, chillers and substation in the yard; skyline through a glass end wall. *Campus:* **the interior of Hall A** (6 rows × 40) with the end wall replaced by glass; outside it, in the yard and beyond: the SMR dome, cooling towers, the uplink dish, a blinking satellite, the original garage preserved as a monument by the lot, two more hall shells as skyline-scale silhouettes with emissive window strips, and the skyline. No exterior camera mode. **Skyline:** each Exit adds a glowing campus silhouette on the horizon (max 6, then a counter), visible wherever a stage has a door or glass.

## 16. Blender asset list (`build_assets.py` → `assets/library.glb`, `assets/stage_1..5.glb`)

Low-poly, flat shading, 1 unit = 1 m, transforms applied (except the shared-mesh variants, which keep their node scale), ≤ 400 tris each. **Front face is −Y in Blender, which `export_yup` turns into +Z in three.js.** Materials: `MAT_steel_dark`, `MAT_rack_white`, `MAT_concrete`, `MAT_plastic`, `MAT_glass`, `MAT_chainlink` (BLEND, texture supplied at runtime), `MAT_led` (emissive strength 4 via `KHR_materials_emissive_strength`; used **only** on skyline window strips, `net_tray_segment` strips, prop LEDs and the hall-shell window strips — never on servers), `MAT_coolant`. Smoke-test one GLB for emissive export first. The current prototype's RackFrame/ServerPanel/LedCyan names are replaced by this scheme.

**Server envelope.** Every `srv_*` fits **0.52 × 0.9 × 0.20 m (W × D × H)**, origin at the envelope's bottom-centre, front at −Y, and carries **two empties `led_0`, `led_1` on its front face** (the scene reads their local positions once as LED quad offsets) and **no LED geometry and no fan children**. Bodies are shared geometry with a neutral albedo; "by tint" means LED colour only (optional per-instance body tint via `setColorAt`). The quantum cylinder and the orbital dish fit inside the envelope.

**Rack.** `rack_frame` 0.6 × 1.2 × 2.0 m, open front at −Y, empties `slot_0..slot_7` at the bottom-centre of each 0.22 m slot, `slot_0` lowest (0.12 m base, 8 × 0.22 m slots, 0.12 m top). Two materials so the garage/white repaint is a material swap.

1. `rack_frame`
2. `srv_pizza_box`, `srv_blade` (one 1U sled mesh, two objects)
3. `srv_gpu_node` (louvred front, no moving parts)
4. `srv_storage` (drive-bay grid, non-emissive)
5. `srv_ai_pod`, `srv_sled` (one pod chassis mesh, two objects)
6. `srv_quantum` (gold cryostat cylinder, horizontal)
7. `srv_orbital` (dish-topped module)
8. `pwr_pdu` (rack-side strip) 9. `pwr_subpanel` 10. `pwr_genset` (yellow, exhaust stack) 11. `pwr_substation` 12. `pwr_hv_feed` (substation mesh + pylon, node scale 1.6) 13. `pwr_smr` (dome)
14. `cool_box_fan` (`fan_0` child) 15. `cool_window_ac` 16. `cool_split_ac` 17. `cool_crac` (`fan_0` child) 18. `cool_chiller`, `cool_cryo` (CRAC body, node scale 2.0 / 3.0, cryo tinted `MAT_coolant`) 19. `cool_tower` (`fan_0`; Campus prop) 20. `cool_immersion`
21. `net_switch` (rack-top 1U) 22. `net_biz_fiber` 23. `net_fiber_uplink` (cabinet) 24. `net_core_router`, `net_ix_port`, `net_cable_landing` (cabinet mesh, node scale 1.5 / 2.0 / 2.5) 25. `net_tray_segment` 1.0 × 0.3 × 0.1, UV 0-1 along length
26. `floor_tile` 1 × 1 (solid and perforated) 27. `wall_segment` (plain, door, glass) 28. `containment_panel`
29. `props_stage_1..5` (one merged decor mesh per stage; `prop_civic` separate so it can drive away; `prop_garage_monument` in stage 5) 30. `skyline_campus` (silhouette with `MAT_led` window strips) 31. `hall_shell_silhouette` (Campus exterior halls)

About twenty distinct meshes; stage props are the only ones over 400 tris. Removed from v2: `rack_full_q1..q4`, GPU `fan_0..3`.

## 17. HUD (phone portrait first, house glass panels)

`.panel` is rgba(10,14,22,.6), blur 10px, 14px radius, as in bonsai-idle; Inter-like sans, tabular mono digits.

- **Top:** Cash (28 px, tweened), $/s, valuation bar to the next goal (first: $1,000,000). Under it three thin meters — Power / Cooling / Network — green → amber → red by §2 thresholds, each with its number (3.3 / 3.0 kW); tapping one highlights its cheapest and best-value fixes. Active contract chips with SLA state and term ring; uptime chip at right; a **gear icon** opening the settings sheet (export/import save, reset run, bloom toggle, sound toggle, photo mode).
- **Bottom sheet** (right panel on desktop; **30vh** sheet with drag handle on phone, snapping 96 px / 30vh / 72vh, the tall snap capped so the Hustle row stays clear under the top panel; four rows and the button fit the 30vh default): tabs **Build**, **Infra**, **Contracts**, **Upgrades**, **Exit**. Rows show cost, +$/s and the kW / Gbps they add; affordable rows glow, overdrawing rows turn amber. ×1 / ×10 / Max.
- **Left (collapsible):** three goal cards, toast log. **Bottom centre:** Hustle (garage only, or a dead hall with no server and no income: `sim.hustleAvailable()`, §14.5), then the live **incident badge** (tap: focus oldest incident; tap again: fix at half bounty). Incidents are otherwise tapped in 3D (raycast on rack frames; a rack frame is ≥ 44 px at the default fit through the Warehouse; from the Hall (30 px) and Campus (20 px) a tap snaps to the nearest rack within half a pitch, and the badge / focus zooms to 80 px/m).
- **Bottom edge:** the ticker, one 14 px line.
- Events: top-centre toast with a ring showing the time left and a Fix button. Milestones: a centre card on desktop, a one-line strip above the Hustle row on phones (the hall and the shop stay visible; the text goes to the log). The offline return card takes the centre everywhere. Tap targets ≥ 44 px; the 3D view owns the band between the top panel and the sheet on phones, ≈46-50% of the screen as built (388 of 844 px at the 30vh sheet; a 36vh sheet would leave ~40%, so 30vh is the trade taken).
- **Layouts, as built.** The right-panel layout applies from 900 px wide and on narrow landscape screens (600-899 px, a phone on its side) with a 300 px panel; the goals column starts collapsed under 1180 px; active contract chips stay in the phone top panel (+24 px while a contract is active). The settings sheet shows the save's health (last save, "saving failed: export your save", "paused: open in another tab" with a Play here button, "a corrupt save was set aside").

## 18. Ticker

~70 lines weighted by stage, no repeat within 15 minutes (the recent-lines list is account level), plus one reaction line per milestone and event. Samples: "Uncle Ray says the site is 'snappier.' You did nothing." · "Analysts: the cloud is just computers. Stock falls." · "Dave's boys have discovered port scanning." · "FrobCoin up 400%. FrobCoin down 400%." · "Your mother would like the garage back. You have shown her the valuation." · "Weatherbot predicts rain. Weatherbot is a radiator." · "The Ministry has no comment. The Ministry has never had a comment." · "Marjorie carries 4% of the internet and does not know."

## 19. Code budget, tooling, risks

`data.js` ~250 (every table in §3-§10 and §14.1; written first, no logic) · `sim.js` ~750 (10 Hz fixed step, buy/upgrade/refresh, contracts, incidents, events, breaker, offline, prestige, save/migrate, event bus) · `scene.js` ~1,300 (GLTFLoader for 6 files, 8 tier InstancedMeshes, LED instanced quads, hall-wide reads, camera fit, fade transitions, skyline, animations, raycast picking, bloom with auto-degrade, photo mode) · `ui.js` ~900 (HUD, sheet, tabs, toasts, ticker, goal cards, settings sheet, number format, touch) · `audio.js` ~40 (WebAudio synth: pop, thud, register; or nothing) · `index.html` ~250 (tokens, layout, importmap pinned to three **0.180.0**) · `build_assets.py` ~500 · `tools/econ_sim.js` ~600 (exists). Total ≈ 4,600 including the sim and assets script; game code ≈ 3,500.

**Tuning authority.** `tools/econ_sim.js` is the node sim this doc was tuned with (greedy player over the same tables: every second it evaluates every package — server + rack + move + the cheapest infra set that keeps all meters ≤ 100%, upgrade + infra, refresh, global — and buys min(wait-to-afford + payback); never knowingly overdraws; takes the best contract combo whose infra it can buy; taps every incident; Hustle 2 taps/s to 2:00). When copied into the repo, fold the v3 patch set (`uptime, vis, add, gmix, ladder, glob125, upg2, gates, glow2, share10, infra115, offline, offval, perkcash, garage, rackg`) into its defaults and commit its five standard reports next to this doc as `tools/pace/{single3h,events2h,noexit2h,nocontract2h,mixed10h}.txt`: time to each milestone, % lit at each stage move, infra share of spend, purchases per minute, longest gap, shares at 1 / 3 / 10 h. The old `tools/pace4.py` is retired (it flattered the pacing and stopped at the Warehouse; Python is also not on the build machine). Knobs in order of safety: server base prices, per-tier growth (floor 1.05), infra base prices, contract multipliers, global spacing (never cluster). `?speed=10` for playtests.

**Risks:** late blow-up (cube-root shares at +10%, glow at 2×, one global per decade, $1Qa soft end; the 10 h sim ends near 10k shares with runs lengthening, not shortening) · meters fading late (Campus infra share measured at 1-8%: if playtests agree, double the Campus infra bases) · tension reading as a tax (contracts are the decision layer; ×10/Max on infra; auto-buyer at 300 shares) · bloom on phones (emissive-only, half-res, auto-off) · the Campus glass wall is the hardest scene (fallback: solid wall with a window strip and the yard props visible only through the door) · save migrations (versioned from day one) · humour fatigue (weighted ticker, two texts per incident, jokes on cards, never on meters).

---

## Appendix: Design notes (where v3 differs from a critic's proposed fix, and why)

1. **Contract stacking — two critics disagreed.** The economy critic's verified set stacks income multipliers additively; the feasibility critic asked for a product. Every pacing number in this doc rests on the additive rule, so additive wins for income; demand factors multiply as both asked. Stated in §7 and in the formula block.
2. **Prestige: both proposed levers, not one.** Glow at 2× alone gave 12-13 minute runs in hour 2 and 7-13 minute Campus runs in hour 3 (shares 3 → 768 at 3 h). +10%/share alone kept runs longer but let the 1.5× glow fire often. Together: 41 / 25 / 30 / 24 / 19 / 19 / 20 minute runs across three hours, ~10,300 shares at 10 h with runs lengthening late. Perk cash fixed at a fraction of the move (Hall $1M, Campus $20M) as recommended.
3. **Garage pace: price trims, Hustle stays $1.** Trims alone bring the lease from 13:03 to 10:39; Hustle $2 alone gives 10:48; both give 9:01 and shorten the tutorial beats more than I want. Hustle $2 stays a one-line knob.
4. **Rack growth per stage (new).** With a flat 1.08 the 144th Campus rack costs $600B and no sim run ever bought all 240 footprints (Refresh never unlocked). 1.08 / 1.08 / 1.06 / 1.05 / 1.04 moves no Exit by more than 2 minutes (racks are < 1% of spend) and makes the last Campus rack ~$2.8B.
5. **Ids are mesh names, kept exactly,** by exporting shared-geometry tiers and infra variants as separate named objects over one mesh datablock. The "10-20 distinct meshes" budget counts datablocks and still holds.
6. **Dark racks and uptime.** The critic's uptime fix did not mention dark racks; v2's "−1/s per dark rack" would again pin uptime under the new +1/s recovery. v3: −0.25/s per dark rack (max −1/s) and no recovery while any rack is dark. Dark racks also earn nothing, which is the real penalty. Not modelled in the sim (it taps every incident); watch in playtests.
7. **1,000-share perk reworded** for the tapered offline rule: cap 24 h and the 20% tail becomes 50% (replaces "offline at 100% for 24 h").
8. **Events** were verified with the critic's uptime formula at the earlier patch set (worst dip low 50s, recovery under a minute); re-run under the v3 set Exit 1 moves 41:13 → 42:10. The breaker, Black Friday burst, DDoS hand-scrub and the per-rack raycast are not in the sim; the sim grants an incident bounty of 20 s of income every 90 s.
9. **Campus infra share is low (1-8%)** because perk cash and Orbital/Sled prices dominate spend there; the meters still sit at 98-99% utilisation, so the constraint binds even though the spend share is small. Listed as a risk with its fix rather than tuned blind.
10. **pace.py replaced by econ_sim.js** (the critic's own suggestion). The sim copy used for these numbers is at `C:\Users\twill\AppData\Local\Temp\claude\C--Projects-vibecodedslopware\af72bc54-9192-48a2-a13c-769450d54d16\scratchpad\econ_sim_v3.js`, with the reports `r_single3h.txt`, `r_mixed10h.txt`, `r_noexit2h.txt`, `z_events2h.txt`, `z_nocontract2h.txt` beside it; copy to `datacenter/tools/` as the first sim deliverable.