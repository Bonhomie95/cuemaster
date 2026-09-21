> **Fresh-build notice — 2026-09-20:** The implementation described as complete below was deleted. The current project starts from scratch in React Native, per the owner’s direction. See [current build decisions](docs/BUILD-DECISIONS.md) and [validation](docs/VALIDATION.md). Historical test counts and completion claims below are not evidence for this build.

# CUEMASTER — Game Design Document
### Version 3.1 | Bonhomie Inc. | Confidential
*Supersedes GDD v3.0 (2026), GDD v2.0, Blueprint v2.0, and the Physics & Visuals deep-dive.
This copy lives in the repository and is the canonical spec; the Downloads copies are archives.*

---

## 0. WHAT CHANGED

### v3.1 (2026-08-27) — corrections & reconciliation with the built engine

| Area | v3.0 said | v3.1 says | Why |
|------|-----------|-----------|-----|
| §3.3/§4.1 fixed 240 Hz tick | "Fixed timestep 1/240 s. No frame-time-dependent math." | **Adaptive substepping with analytic integration; trajectory *sampled* at 240 Hz** for snapshots/replays | A break-speed ball (11 m/s) moves **45.8 mm per 240 Hz tick** through a 57.15 mm ball — tick-boundary overlap tests step clean through the rack. The built engine substeps so no ball moves more than a quarter radius per step, refines contacts by rewind-and-halve (worst interpenetration ≤ 0.29 mm), and integrates sliding/rolling phases analytically (both have constant acceleration). Determinism is **proven**: two identical inputs produce bit-identical output. Every netcode section still holds — 240 Hz is the *sampling* rate, not the integration rate. |
| §3.1 Three.js "retired" | Unity is the single client stack | **Unity is the flagship client. The browser build (Three.js) is the physics reference implementation, the test harness, and the soft-launch vehicle** (Capacitor-wrapped for the stores until the Unity client ships) | The browser build exists, is playable end-to-end, and carries the entire verified test suite (110 engine/rules checks, 19 E2E UI checks, 60-rack fuzz). The physics is pure C-style math with zero renderer coupling and ports to C# line-for-line. Throwing away the only shippable, testable client while the Unity client is built is waste; wrapping it ships real players and real telemetry into the exact meta systems the Unity client will inherit. |
| §4 physics constants | Estimates (cushion 0.85→0.75 etc.) | **Measured/cited values from the built engine** (see §4) | Constants now come from primary sources with citations in `game/src/physics/constants.js`, not tuning: WPA equipment spec, Alciatore's friction measurements and TP A-14 throw model, Kim (arXiv:2104.11232) for cue strike and miscue limit. |
| §8.4 Track B payouts | "70% of entries + platform guarantee" only | **Indicative per-placement payout tables restored** from Blueprint v2 (they were dropped in the v3.0 merge) | The blueprint's concrete top-3 payout ranges and the top-100 monthly leaderboard distribution are the actual product spec; §8.4 carries them again, marked as scaling with fill rate. Payout rail is **USDC only** (v2's BTC option is dropped — one rail, one audit surface). |
| §11 HUD | v2.0 layout carried forward | **Updated to the built, teardown-validated interaction set**: VS match intro, pull-down-and-release power stroke (no SHOOT button), shot-clock ring on the avatar (no numeric clock), tap-to-enlarge spin picker, event-log-driven pot feedback, series score | An 8 Ball Pool gameplay teardown (2026-08-27, `refs/competitor-8bp-analysis.md`) identified the interaction beats that carry their feel; all are now implemented and E2E-tested in the reference build. |
| §8.5 AI bots | Spec only | **A working geometric bot exists** in the reference build's test suite (plays complete legal racks, wins by position play); tier system wraps it in an error-injection layer | It has already played 60+ automated racks clean as the fuzz harness. |
| — | — | **Appendix A added**: reference implementation status — what is already built and verified | Ground truth for every following phase. |

### v3.0 highlights (unchanged)
Unity 6 LTS · explicit 8 Ball Pool benchmark · Glicko-2 + divisions + seasons ·
Apple/Google/Meta/Guest auth + country identity + Country Cup · dual-track
tournaments (coin prizes worldwide, cash prizes only in counsel-cleared regions,
**no betting or wagers ever**) · smoothness as a first-class pillar · four render
tiers.

---

## 1. CONCEPT STATEMENT

CueMaster is a mobile-first, server-authoritative 3D pool game with real
physics, national-identity competition, and a reward economy built on skill —
not chance. Players compete for their country's flag on global ladders and in
coin-entry tournaments whose prizes are earned by winning, never by wagering.

**Tagline:** *Real physics. Real rivals. Play for your flag.*

**Genre:** Real-time competitive sports simulation
**Platform:** iOS + Android — Unity 6 LTS flagship client; Capacitor-wrapped browser build for soft launch (§3.1)
**Orientation:** Landscape locked
**Target audience:** 18–40, pool/billiards players, mobile esports audience, national-pride competitors, cosmetic collectors
**Monetisation:** Coin IAP + premium subscription + tournament entry fees + cosmetic marketplace
**Explicitly excluded:** Player-vs-player wagering, betting of any kind, casino mechanics, loot boxes with paid keys

---

## 2. COMPETITIVE BENCHMARK — HOW WE BEAT 8 BALL POOL

8 Ball Pool (Miniclip) is the market leader with 100M+ MAU. It wins on network
effects and simplicity. It is beatable on every axis that matters to a player
who has been playing longer than two weeks.

| Axis | 8 Ball Pool | CueMaster | Why it matters |
|------|------------|-----------|----------------|
| Physics | 2D physics dressed as 3D; no squirt, no throw, no jaw rattle; oversized pocket capture zones | Full 3D deterministic sim: squirt, throw, cushion compression, slide-to-roll, jaw rattle — **built and verified** | Skilled players feel fake physics within 10 shots and churn. Real physics is a moat — it takes years to build and Miniclip can't retrofit it without breaking their player base's muscle memory |
| Camera | Fixed top-down | Broadside broadcast default + behind-cue aim cam + break cam + cinematic replay + free-orbit spectator | Presence. The behind-cue camera is where "this feels like real pool" happens |
| Visuals | Flat, dated, 30fps on most devices | PBR everywhere, 60fps floor on 2019 hardware, up to 120fps Cinematic tier | The first 5 seconds of gameplay footage is the ad |
| Input feel | Drag-to-aim with visible latency | 120Hz touch sampling, <50ms local shot feedback, per-surface haptics; the pull-and-release stroke **already matches theirs** and the physics under it doesn't lie | Feel is retention. Latency is churn |
| Stakes model | Coin "betting" between players (soft-gambling optics, banned framing in several markets) | Entry-fee tournaments + ladder rewards. No wagers | Cleaner legally, cleaner in app-store review, cleaner in brand perception |
| Competition | Flat ELO number, no seasons | Divisions, promotion series, seasons, national ladders, Country Cup, clans | Gives every player a *reason* to queue tonight |
| Identity | Generic avatar | Country flag identity, national leaderboards, "play for your flag" | Nationality is the cheapest, most powerful belonging mechanic in mobile competitive games |
| Fairness | Client-trusting; aim hacks and long-line mods are rampant | Server-authoritative physics; client sends input only | "The #1 pool app is full of cheaters" is our marketing wedge into their veteran player base |

**Positioning line for the store page:** *The pool game for people who've outgrown 8 Ball Pool.*

**Teardown reference:** frame-by-frame analysis of their live product and the
list of interaction beats we adopted vs rejected: `refs/competitor-8bp-analysis.md`.

---

## 3. ENGINE & STACK

### 3.1 Client strategy (amended in v3.1)

The v2.0 conclusion stands: React Native cannot own a high-rate physics loop, a
3D renderer, and sub-frame touch input simultaneously. **Unity 6 LTS is the
flagship client** for the reasons v3.0 gave (URP Render Graph, GPU Resident
Drawer, STP upscaling, Adaptive Performance, Input System 120 Hz sampling).

**Amended, not retired:** the Three.js browser build is kept as three things:

1. **Physics reference implementation.** The simulation is pure math over plain
   structs (no DOM, no renderer types, no `Math.random`, no `Date`) and is the
   normative behaviour the C# port must reproduce bit-for-bit. Its test suite
   is the acceptance suite for the port.
2. **Test harness.** Deterministic screenshot harness, E2E UI tests, 60-rack
   fuzz — CI runs against the browser build in seconds with no device farm.
3. **Soft-launch vehicle.** Capacitor-wrapped for App Store / Play Store so the
   meta game (auth, economy, tiers, leaderboards) ships to real players while
   the Unity client is built. The meta backend is client-agnostic; nothing
   built for soft launch is discarded when Unity replaces the shell.

### 3.2 Stack decision

| Layer | Technology |
|-------|-----------|
| Flagship game client | Unity 6 LTS (C#), URP, landscape locked |
| Soft-launch client | Browser build (Three.js) wrapped in Capacitor 6 (iOS + Android), landscape locked |
| Physics simulation | Custom deterministic billiards engine — reference in JS (built), C# port shared verbatim between server and Unity client |
| Server physics host | The C# physics assembly compiled for .NET 8 inside the match server (no dual implementation) — until the port lands, the JS engine runs server-side under Node (zero translation) |
| Multiplayer rooms | Colyseus (Node.js) orchestration calling the physics service — OR full .NET match server (Phase 2 spike; determinism favours all-.NET) |
| Backend API | Node.js + Express |
| Database | PostgreSQL + Prisma; TimescaleDB extension for match analytics |
| Realtime cache / leaderboards | Redis 7 (sorted sets) |
| Auth | Sign in with Apple, Google Sign-In, Meta Login, Guest (device-bound) — Firebase Auth or custom OIDC broker |
| Payments / IAP | RevenueCat |
| Cash prize payouts (permitted regions only) | Circle (USDC), outbound-only |
| KYC (cash-prize track only) | Persona (primary) / Onfido (fallback) |
| Geo & edge | Cloudflare (WebSocket proxy, geo-blocking Workers, DDoS) |
| Infra | AWS EC2 multi-region (us-east, eu-west, ap-southeast), S3 replays, Docker, GitHub Actions, Grafana + Prometheus |

### 3.3 Determinism requirement (corrected in v3.1)

Replays, server reconciliation, and anti-cheat all depend on the physics being
**bit-identical** given the same inputs. Rules:

- No engine physics (`UnityEngine.Physics` or otherwise) in the simulation.
  Pure math over plain structs.
- **Adaptive substepping, not a fixed integration tick.** The v3.0 "fixed
  1/240 s timestep" is arithmetically impossible for billiards: an 11 m/s break
  ball travels 45.8 mm per tick through a 57.15 mm ball, so tick-boundary
  collision tests tunnel through the rack. The engine instead bounds each
  substep so no ball moves more than a quarter radius, refines contact times by
  rewind-and-halve (worst interpenetration measured ≤ 0.29 mm), and integrates
  motion **analytically** within substeps — the sliding and rolling phases both
  have constant acceleration, so there is no frame-rate-dependent numerical
  drift to control in the first place.
- **240 Hz is the sampling rate.** The trajectory is sampled to fixed 240 Hz
  snapshot frames for network snapshots, interpolation, and replays. Every
  netcode number elsewhere in this document is unchanged.
- Determinism across architectures: strict-float discipline in the reference
  engine (no transcendental shortcuts, no fused-multiply-add variance paths);
  the C# port runs the Week-1 ARM-vs-x86 spike, falling back to fixed-point
  Q32.32 only if drift appears.
- The client runs the *same* sim locally for prediction; the server result is
  authoritative and any divergence > epsilon is logged as a determinism bug,
  never smoothed over.
- A replay is `(initial rack seed, ordered input list)` — a few KB per match.
  **Verified in the reference build:** identical inputs replay bit-identically.

---

## 4. PHYSICS ENGINE — THE PRODUCT

The physics engine is the product. Every other feature exists to frame it.
**Status: built and verified in the reference implementation** — every
subsystem below exists in `game/src/physics/` with tests, and constants carry
citations to primary sources in `constants.js`.

### 4.1 Simulation architecture (corrected in v3.1)

```
Server: authoritative simulation per shot
  ├── Receives: player input (aim angle, cue speed, spin offset, elevation, timestamp)
  ├── Simulates: adaptive substeps, analytic integration (§3.3)
  ├── Emits:    240 Hz-sampled snapshot frames + discrete events (collision, pocket)
  │             — events carry impulse/speed/fullness for audio & haptics
  └── Clients:  play back frames; predict locally on own shot

Client: 60–120fps render loop
  ├── Predicts:     full local sim on the player's own shot (instant feedback)
  ├── Reconciles:   against server result (divergence = logged build bug)
  ├── Interpolates: opponent/idle state between snapshots (adaptive 60–140ms buffer)
  └── Renders:      PBR materials, physics-driven audio + haptics
```

### 4.2 Ball-to-ball collision

Elastic collision, equal masses:

```
v₁' = v₁ − ((v₁−v₂)·n̂) · n̂
v₂' = v₂ + ((v₁−v₂)·n̂) · n̂
```

Layered effects — all four required, all four **built**:

- **Throw:** cut-induced and spin-induced, using Alciatore's
  friction-vs-surface-speed fit — throw is correctly *larger on slow cuts than
  fast ones* (TP A-14). The 90° stun-cut rule measures 85.8° with throw
  accounting for the remainder, matching table measurements.
- **Squirt (cue-ball deflection):** proportional to tip offset, independent of
  cue speed (Kim, arXiv:2104.11232).
- **Deflection/speed transfer by fullness:** fuller hits transfer more speed;
  fullness is logged per contact and drives audio tone.
- **Double kiss:** re-contact falls out of true continuous collision handling —
  not a special case.

### 4.3 Spin system (9-zone strike map)

| Hit zone | Effect | Result |
|----------|--------|--------|
| Centre | Stun | Cue ball stops dead on full contact |
| Top | Follow | Continues forward after contact |
| Bottom | Draw | Reverses after contact |
| Left / Right | Side (english) | Squirt on delivery, cushion throw on rebound |
| Diagonals | Combined | Curved paths (masse territory at high offset + elevation) |

Spin decays through the **slide-to-roll transition** (higher effective friction
while sliding; natural roll falls out at exactly 2r/5 tip height — verified).
Cushion contact during slide rebounds differently than during pure roll.

**Masse:** from the spin axis tilting with cue elevation. Available to all —
no unlock gate. **Miscue limit at r/2** tip offset: the spin picker will not
accept an offset past it (the tip would slide off the ball).

### 4.4 Cushion rebound

- **Speed-dependent restitution — measured: 88.6% at low speed → 79.2% at
  high speed** (replaces v3.0's 0.85→0.75 estimate).
- **Cushion throw:** from friction on a nose that sits above the ball's equator
  (nose height 63.5% of ball diameter, WPA spec).
- **Multi-rail accuracy:** validated against known 2-rail and 3-rail kicking
  systems in the automated suite.
- **Corner vs side pocket jaw geometry** modelled separately; jaws rattle in
  *and* out off real cushion tips.

### 4.5 Rolling friction

Rolling resistance from Alciatore's measurements for tournament worsted on
slate. **Table speed is a per-tournament configurable** (fast/medium/slow
cloth), disclosed in tournament rules.

### 4.6 Pocket geometry & jaw physics

- Entrance cone geometry, not distance checks. **Capture only when the ball's
  centre crosses the mouth — no magnet zone** (verified; this is the exact
  opposite of 8 Ball Pool's oversized capture radius, and players feel it).
- Corner mouth 4.5 in, side mouth 5 in (WPA); **pocket size is a tournament
  ruleset variable** (pro-cut corners for championship events).
- Break behaviour, measured across the fuzz suite: full-power break scatters
  the rack ~2.2 m, pots a ball ~50% of racks, scratches ~7% — matching
  real-table statistics. Rack jitter is deliberate: 0.35 mm of seeded
  randomness per ball, because a perfect rack struck dead centre is symmetric
  and every break would be the same break.

### 4.7 Physics-driven audio

Audio events derive from physics values, never animation triggers. **Built as
modal synthesis** — sharply-tuned decaying modes plus milliseconds of contact
noise, nothing sampled, nothing looped; spectral flatness of impacts measures
0.0003–0.006 (broadband noise ≈ 1.0):

| Event | Derivation | Measured (reference build) |
|-------|-----------|-----------------------------|
| Ball-ball | Volume ∝ impulse; tone varies full vs glancing | −9 dBFS, 28 ms (hard) / −13 dBFS, 22 ms (thin) |
| Ball-cushion | Rubber thud ∝ approach speed | −10 dBFS, 74 ms |
| Cue strike | Lower-pitched than ball click, ∝ power | −11 dBFS, 61 ms |
| Jaw clip | Rapid tick per rattle contact | −20 dBFS, 16 ms |
| Pocket entry | Drop impact + leather ∝ entry speed | −15 dBFS, 66 ms |
| Rolling | Near-silent low-passed rumble (tournament cloth is quiet) | — |
| Break | Peak event — crack + computed secondary scatter | — |
| Chalk | Pre-shot chalk sound + particle | — |

### 4.8 Physics-driven haptics

| Event | iOS (Core Haptics) / Android (VibrationEffect) |
|-------|------------------------------------------------|
| Cue strike | Sharp transient, intensity ∝ shot power |
| Own ball potted | Soft double-tap |
| Break | Heavy transient + 80ms decay rumble |
| Jaw rattle | Rapid light ticks matching rattle contacts |
| Power bar drag | Subtle continuous texture that stiffens near max power |
| Rank-up / trophy | Signature celebratory pattern |

Toggleable in settings; auto-disabled in low-battery mode. In the Capacitor
soft-launch client, delivered via the Haptics plugin from the same physics
events that drive audio.

---

## 5. SMOOTHNESS — FIRST-CLASS PILLAR

"Smooth" is measurable. Launch-blocking budgets:

| Metric | Budget |
|--------|--------|
| Touch-to-aim-line response | ≤ 1 render frame (≤16.6ms at 60fps) |
| Shot commit → local ball movement | ≤ 50ms (client prediction, no server round-trip) |
| Frame rate floor | 60fps on iPhone XR / Pixel 3a class, zero drops during break |
| High tier | 90–120fps on ProMotion/high-refresh with LTPO-aware pacing |
| Frame-time variance | < 2ms stddev in match |
| Cold start → Home | ≤ 3.5s on 2020 mid-range |
| Matchmaking accept → break shot | ≤ 8s |
| Snapshot interpolation buffer | Adaptive 60–140ms based on measured jitter |
| Playable RTT ceiling | 250ms clean; 400ms degraded-but-fair |
| Reconnect grace | 30s window preserves the match |

Engineering measures: Adaptive Performance thermal governor (resolution →
shadows → post, **never** frame rate) · zero-GC match loop · 1-frame touch
prediction on aim drag · shader pre-warming during matchmaking · low-latency
audio path (OpenSL/AAudio fast path on Android).

Reference-build baseline (M-class laptop, 2880×1620): 8.3–10.0 ms rAF frame
times across quality tiers, 114–159 draw calls — the browser client already
holds 60 fps with headroom on desktop-class hardware; the mobile matrix is
profiled at Capacitor wrap time.

---

## 6. VISUAL DESIGN — A GENERATION AHEAD

### 6.1 Art direction

**Luxury realism with earned cosmetics.** The free default is already
photorealistic: tournament mahogany rails, worn-in green felt with visible nap,
resin balls with authentic warmth, one warm overhead lamp. Cosmetics layer on
top; the realism baseline never drops. **Physics constants never change with
skins.**

**Universal polish floor (all tiers):**
- Physically correct proportions from the WPA spec — the same constants file
  drives the physics *and* generates the table mesh, so what you see is what
  you play (built)
- Correct perspective and lens behaviour — no orthographic cheats
- Ball number/stripe orientation actually rotates with ball spin (built —
  8 Ball Pool fakes this and players notice)
- Contact shadow under every ball + cloth bounce light on undersides (built)
- The cue visibly strikes at the chosen tip offset (built)
- Number circle printed at 0.385 of ball radius, measured from an Aramith ball
  — oversized number circles are the loudest "toy ball" tell

### 6.2 Four render tiers (auto-selected, manually overridable)

**TIER 1 — PERFORMANCE** (2018–2019 devices · locked 60fps)
PBR ball materials, baked table lighting, blob shadows, single felt diffuse +
lightweight normal, ASTC, no post, STP upscale from ~75%. Target iPhone XR /
Pixel 3a, zero break-shot drops.

**TIER 2 — BALANCED** (2020–2022 · locked 60fps)
Full PBR resin with specular streaks, one real-time shadow lamp, felt
micro-fibre normal+roughness, chalk dust particles, SSR on balls, FXAA +
subtle bloom. Target iPhone 12 / Pixel 5.

**TIER 3 — ULTRA** (2023–2024 flagships · 90–120fps)
Reflection probes + SSR, procedural micro-scratches, volumetric lamp light,
PCF soft shadows, felt nap micro-detail, ball-trail motion blur, DoF in aim
camera, HDR10 where supported.

**TIER 4 — CINEMATIC** (2025+ flagship · 120fps)
Hardware RT reflections where supported (probe fallback), venues alive in
frame (rain on rooftop glass, dust motes, crowd silhouettes), cue-tip
deformation and chalk transfer in close-ups, optional slow-motion break with
cloth ripple. Exists primarily to make **marketing footage** untouchable.

Reference-build note: the browser client's three tiers (Performance/Balanced/
High) implement the tier-1..3 look on WebGL — bloom thresholded in linear HDR
(9.0), environment lighting confined to balls so the pool-of-light falloff
survives, streak highlights from long-narrow lamp diffusers. Its "High" is the
soft-launch ceiling; Ultra/Cinematic are Unity-client territory.

### 6.3 Camera system

- **Broadside** — strategic default: the table runs left-to-right across the
  screen, broadcast-style, slight elevation for the 3D read (built; validated
  against the 8BP teardown — their reading direction, our depth)
- **Aim camera** — behind-cue close-up with DoF; the signature view (built)
- **Break camera** — low dynamic angle near the rack (built)
- **Replay camera** — automatic cinematic cuts on match-deciding shots
- **Spectator camera** — free orbit (spectators only)
- **Photo mode** (Phase 5) — pause replay, frame, filter, share

### 6.4 Cosmetics

Felts, cues, ball sets, avatar frames, chalk colours, emotes, venue
backgrounds, break VFX, cue racks — rarity tiers Common/Rare/Epic/Legendary.

- **Cue stats** (the only gameplay-adjacent items, capped and visible): max
  power, aim-guide length, spin window, +shot-clock seconds. Stats never
  exceed the caps published in tournament rules; physics constants are
  untouched by all cosmetics.
- **National cue & felt lines** — flag-motif cosmetics per country.
- **Earned-only prestige items** never sold: Champion's Gold cue (100 ranked
  wins), Grandmaster felt, Country Cup winner ball set.
- Opponents see your cosmetics in lobby and match.
- **No loot boxes.** Straight prices only (also removes Apple/Google
  odds-disclosure surface entirely).

---

## 7. IDENTITY, AUTH & ONBOARDING

### 7.1 Sign-in options

| Method | Notes |
|--------|-------|
| **Sign in with Apple** | Mandatory on iOS the moment any third-party login is offered (App Store Guideline 4.8). Supports hide-my-email. |
| **Google Sign-In** | Primary on Android; available on iOS too. |
| **Meta (Facebook) Login** | Friend-graph → "friends who play"; Limited Login mode on iOS for ATT compliance. |
| **Guest** | One tap, zero friction. Device-bound account created silently. |
| Email (fallback) | Support/recovery edge cases only, de-emphasised. |

All logins resolve to one CueMaster account; providers linkable later in
Settings. **In-app account deletion** (required by both stores).

### 7.2 Guest mode — generous but bounded

**Guests CAN:** unlimited practice + all AI tiers; casual online 1v1 (10/day);
earn and spend coins on cosmetics (device-bound); free cosmetic set; spectate.

**Guests CANNOT:** ranked or leaderboards; tournaments; coin packs above
Starter; friends/clans; transfer progress without signing in.

**Conversion moments (contextual, one-tap):** 3-win casual streak, first
tournament browse, first flag equip. Guest progress **fully merges** on
sign-in — stated on the guest button itself.

### 7.3 Country & flag identity

- Auto-detected (SIM/locale/IP majority vote), user confirms/corrects from the
  full list. Diaspora players may represent their home country.
- Flag on profile, matchmaking card, in-match nameplate, leaderboards,
  brackets, spectator overlay.
- Country changes: once per **180 days**.
- **National leaderboards** — Global / National / Friends / Regional tabs
  everywhere. "Top 100 in Nigeria" is achievable long before "Top 100 in the
  world".
- **Country Cup (monthly):** ranked wins bank national points (normalised per
  active players). Top nations + top contributors earn exclusive cosmetics +
  coins. Zero entry fee — engagement engine, not revenue.
- **National pride events:** independence-day felt/chalk freebies.

---

## 8. GAME MODES

### 8.1 Casual 1v1 (launch)
Unranked, guests allowed, no coins required. Full physics, full rules. Hidden
MMR matchmaking.

### 8.2 Ranked 1v1 (launch)
Signed-in only. Glicko-2, division ladder (§9). Small daily-capped coin bonus.

### 8.3 Rulesets
- **8-Ball** (launch; WPA rules — called-shots toggle per playlist; the
  reference build implements WPA §4 fully, including all five loss conditions,
  break-scratch kitchen rule, and 8-on-break spotting)
- **9-Ball** (Phase 4)
- **10-Ball** (Phase 4)
- **One-Pocket** (Phase 5), **Snooker variant** (post-launch)
- **Pass & Play** (built) and **Practice/drills** — offline, guests welcome

### 8.4 Tournaments (Phase 4) — the reward engine

Single-elimination coin-entry brackets. **Two prize tracks:**

**Track A — Coin-Prize Tournaments (default, worldwide)**
Prizes in coins, exclusive cosmetics, trophies, leaderboard points. No
gambling-law surface, no KYC, no geo-blocking. The everyday competitive loop.

**Track B — Cash-Prize Tournaments (permitted regions only)**
Prize pools in **USDC**, paid outbound-only via Circle. Entry in coins. Prize
pool = pooled entries (70%) + platform guarantee top-up; platform retains 30%
of entries. Skillz-model skill competition: outcome determined solely by skill,
server-generated rack seeds identical bracket-wide where feasible. Geo-blocked
where unfavourable; counsel signs off market-by-market (§12).

| Tier | Entry | Bracket | Cadence | Track |
|------|-------|---------|---------|-------|
| Daily Starter | 50 coins | 256–2,048 | 20×/day | A |
| Daily Elite | 200 coins | 2,048 | 4×/day | A + B where permitted |
| Weekly Open | 500 coins | 8,192 | 14×/week | A + B where permitted |
| Weekly Pro | 2,000 coins | 8,192 | 2×/week | B where permitted, else A |
| Monthly Championship | 5,000 coins + rank gate | 32,768 | 2–4×/month | B where permitted, else A |
| Annual CueMaster Championship | Qualification only | — | 1×/year | Flagship, sponsored |

**Indicative Track B payouts (restored from Blueprint v2; scale with bracket
fill rate, advertised conservatively, guaranteed from escrow):**

| Event | 1st | 2nd | 3rd | Also |
|-------|-----|-----|-----|------|
| Daily | $40–80 | $15–25 | $8–15 | — |
| Weekly | $200–500 | $80–150 | $40–75 | weekly leaderboard bonus pool |
| Monthly Championship | $1,000–5,000 | $500–1,500 | $250–750 | **top-100 monthly leaderboard distribution** |

Monthly champions crowned publicly; leaderboard snapshot at month end. Best-of
format 3/5/7/9 (finals Bo11) per bracket. Mandatory scroll-to-bottom rules
modal before first entry of each tier. Bracket view: live scores, your path,
country flags.

### 8.5 AI bot opponents
Five tiers — **Rookie → Club → Bar Champion → Pro → Elite** — driving offline
play and casual backfill only; **bots never appear in ranked or tournaments.**
Bots run the same physics engine with an intention layer (shot selection,
position targets, error injection scaled by tier) so misses look human.
**Status:** the geometric core bot is built and has played hundreds of
automated racks in the reference suite; the tier layer wraps it.

### 8.6 Spectator mode
2 s delay (anti-coaching), spectator count visible, free-orbit camera.
Twitch/YouTube integration Phase 6.

### 8.7 Replays
Server-side compressed input logs replayed through the deterministic engine.
10 free slots, 100 premium, extra for coins. Shareable replay codes; viewer
includes cinematic camera + photo mode.

---

## 9. COMPETITIVE SYSTEM

### 9.1 Rating: Glicko-2
Tracks rating deviation and volatility — new players converge in ~10 matches.
Hidden MMR runs matchmaking; the visible layer:

### 9.2 Division ladder

```
Bronze III → II → I
Silver III → II → I
Gold III → II → I
Platinum III → II → I
Diamond III → II → I
Master
Grandmaster (top 500 per region, live-ranked)
```

10 placement matches · promotion at thresholds · **Bo3 promotion series** into
Master · rank decay in Master+ after 7 idle days · 3-loss demotion shield after
promotion · anti-smurf: device fingerprint + accelerated convergence.

### 9.3 Seasons
8-week seasons, soft reset (compress toward mean), season reward track,
season-stamped items ("Season 3 Diamond felt").

### 9.4 Leaderboards
Redis sorted sets + Postgres persistence. Tabs: Global / National / Regional /
Friends / Clan. Sort: rating / tournament points / win rate. Tiebreak: points →
win% → games. Your row always pinned.

### 9.5 Clans (Phase 6)
25 members, clan tag, weekly clan leagues, Country Cup contribution multiplier.

### 9.6 Tournament points
Win +10 base scaled by round depth (final +100); losses deduct scaled by
opponent strength. Daily 1× / Weekly 1.5× / Monthly 3×. Feeds all boards and
annual qualification.

---

## 10. ECONOMY & MONETISATION

### 10.1 The line we never cross
**No betting.** Players never stake against each other. No mechanic where one
player's loss funds another player's win directly. Rewards exist only as
competition outcomes. Stated in ToS, store listing, and first-open disclosure.

### 10.2 Coins
**Buy:** IAP packs, premium grant. **Earn:** ranked win bonus (daily-capped),
login streaks, season missions, achievements, referrals, Track A placements.
**Spend:** tournament entries (primary utility), cosmetics, replay slots.
**Rules:** non-refundable, non-transferable, never redeemable for cash, earning
daily-capped, seasonal soft-sinks. **No ads-to-coins path.**

### 10.3 Coin packs
Starter 500/$0.99 · Player 1,200/$1.99 · Club 3,500/$4.99 · Pro 8,000/$9.99 ·
Champion 20,000/$19.99 · Elite 50,000/$49.99.

### 10.4 Premium ($4.99/mo)
500 coins/mo, ad-free (interstitials only ever between casual matches, never
ranked/tournaments), 10% cosmetic discount, priority queue, 100 replay slots,
monthly subscriber cue, badge.

### 10.5 Revenue mix & prize funding
Coin IAP ~45% · ads ~20% (casual-only) · premium ~22% · cosmetics ~10% ·
sponsorships ~3%. Track B pools from a **segregated prize escrow**, never
commingled; no rake on winnings — advertised prize paid in full (minus legally
required withholding).

---

## 11. UI & SCREEN FLOW (updated in v3.1 to the built interaction set)

- **Screen 0 — First open:** age gate → country confirm (flag picker) → auth
  sheet (Apple / Google / Meta / **Continue as Guest**; guest subtext: "Your
  progress saves and transfers when you sign in later.")
- **Home:** play cards (Ranked / Casual / vs AI tiers / Pass & Play / Drills),
  avatar + flag + division emblem, coin balance, Country Cup card, season
  progress bar. Guest state shows "Sign in to play Ranked" chip.
- **Match intro:** VS screen — both players in frames, names, flags, division
  emblems, season number; opponent card fills on match found. (Built.)
- **Match HUD (built and E2E-tested):**
  - Top bar: player cards with avatar, name, group label, **7-slot ball tray**
    that fills live as balls drop (driven by the physics event log, same clock
    as audio); phase line + series score centre; connection pip (online).
  - **Shot clock = a ring draining around the active player's avatar** — no
    numeric clock. Red under 10 s.
  - **Power = pull-and-release:** pull the right-edge bar DOWN, the cue draws
    back in-scene proportionally; release fires; return to the top before
    release to cancel; meter spends to zero after each shot. **There is no
    shoot button.**
  - **Spin:** mini dial (drag = precise adjust) — tap opens the full-screen
    cue-ball face picker; miscue limit ring enforced.
  - Aim: line + ghost ball + object-ball and tangent ticks; guide length is a
    cue stat and a playlist rule.
  - Safety declare (WPA §4.5) — visible only in call-shot playlists.
  - Toasts for rules events; fouls always say *why*.
- **Post-match:** rating delta + division arc, Country Cup points banked,
  series score, replay share.
- **Tournament lobby:** track badge; non-permitted regions never see Track B.
- **Wallet:** balance, packs, transaction history; cash panel (Track B regions)
  with KYC status and 30-day spend display.
- **Settings:** Linked Accounts, Country (180-day note), Haptics, Sound,
  Render tier, responsible-gaming block, **Delete Account**.

---

## 12. LEGAL & COMPLIANCE

All of v2.0 §6 stands (geo-blocking, tiered KYC at $100/$500/$1k/$4k,
responsible gaming: self-set limits, self-exclusion, cooling-off, 30-day spend
display, 1099s at $600+, OFAC screening, segregated escrow, counsel review
pre-launch). v3.x adjustments:

- **Track separation is the compliance architecture.** Track A worldwide day
  one, zero KYC. Track B market-by-market on written counsel opinion. US
  baseline exclusions at minimum: AZ, AR, CT, DE, LA, MT, SC, SD, TN (counsel
  confirms current list).
- **Store compliance:** skill-competition framing, no gambling keywords, prize
  terms in metadata, Apple pre-review for Track B. Sign in with Apple (4.8).
  In-app account deletion. Guest mode never gates previously-earned paid
  content. Age gate at first open (soft-launch build ships it from day one).
- **Guest + payments:** Starter-pack cap; receipts bind to device ID.
- **Meta Login:** ATT-compliant Limited Login on iOS.
- **Entity:** US LLC (Wyoming/Delaware); counsel advises whether Track B needs
  a separate contest entity.

---

## 13. ANTI-CHEAT & INTEGRITY

v2.0 §7 in full (server-authoritative physics, input-only clients, timestamp
validation, device fingerprinting, collusion detection, VPN detection,
statistical anomaly model, human appeals, rate limiting). Plus:

- **Determinism audits:** sampled replays re-simulated nightly; divergence
  flags the build, not the player.
- **Aim-assist detection:** angular-noise distribution modelling; flag →
  shadow-review → ban-wave.
- **Tournament integrity:** identical rack seeds per round where format
  allows; input-log review on finals; payout hold + human review on outliers.

---

## 14. SYSTEM ARCHITECTURE

v2.0 §9 (room pattern, snapshot interpolation, DB schema, API surface) with:

- **Physics host:** one engine. Near-term the JS reference engine runs
  server-side under Node verbatim; the C# assembly replaces it when the Unity
  port lands (4-day Phase-2 spike decides Colyseus+sidecar vs all-.NET).
- **DB additions:** `users.country_code`, `country_changed_at`,
  `auth_providers[]`, `is_guest`, `guest_device_id`; tables `seasons`,
  `season_progress`, `clans`, `clan_members`, `country_cup_points`,
  `divisions_history`.
- **API additions:** `POST /auth/social`, `POST /auth/guest`,
  `POST /auth/link-provider`, `POST /account/merge-guest`,
  `GET /leaderboard?scope=`, `GET /country-cup/standings`,
  `POST /account/country`, `DELETE /account`.
- **Regions:** us-east, eu-west, ap-southeast at launch; af-south fast-follow.

---

## 15. BUILD ROADMAP (amended: reference build is Phase 1–2 reality)

### Phase 1 — Physics engine — **DONE in the reference implementation**
Deterministic core (collisions, slide-to-roll, 9-zone spin, squirt/throw,
cushion compression + throw, jaw physics, double-kiss), physics-driven audio,
110 automated checks + 60-rack fuzz, grey-box playable. Remaining Phase-1 item:
real-player sign-off session on the browser build.

### Phase 2 — Client + multiplayer (Weeks 1–6 from now)
- **Soft-launch client:** Capacitor wrap of the browser build (store-standard:
  age gate, auth sheet, account deletion, privacy links, icons, screenshots —
  see `store/`)
- **Unity project init** in parallel (URP, landscape, Input System) + C#
  physics port against the JS acceptance suite; Week-1 determinism spike
- Match server (Node first — runs the JS engine verbatim), rooms,
  input→snapshot pipeline, prediction/reconciliation
- **Auth: Apple + Google + Meta + Guest, country picker, account merge**
- Device matrix profiling

### Phase 3 — Competitive core + economy (Weeks 7–12)
Glicko-2, placements, divisions, promotion series, decay · national + global
leaderboards, Country Cup v1 · season framework · coin wallet, RevenueCat,
store UI, first cosmetic batch (5 felts, 8 cues, 4 ball sets, 3 national
lines) · premium sub · age gate + guest limits + responsible-gaming settings.

### Phase 4 — Tournaments (Weeks 13–19)
Bracket engine (256–32,768), Track A worldwide · rules disclosure flow,
tournament points + boards · 9-ball + 10-ball · Track B foundations (Persona
KYC, Circle payouts, geo-blocking, escrow) **behind a flag until counsel
clears markets** · closed beta with first Track A season.

### Phase 5 — Polish + launch (Weeks 20–25)
Ultra + Cinematic tiers (Unity), photo mode · AI tier layer, spectator,
replay viewer · referral program · store capture from Cinematic tier · legal
pass, anti-cheat + determinism audit pipeline · submissions · **launch Track A
everywhere; Track B first cleared markets.**

### Phase 6 — Growth (Month 7+)
Clans + leagues, Country Cup v2, streaming integration, creator marketplace,
One-Pocket, snooker, af-south region, localisation wave (FR/PT/AR/ES/ID),
Annual Championship, pro partnerships.

---

## 16. RISK & MITIGATION

| Risk | Mitigation |
|------|-----------|
| Physics desync | Deterministic shared sim + server authority; divergence is a logged build-bug |
| Physics feels off to real players | Phase-1 gate: real players sign off on the already-playable reference build |
| C# port drifts from reference | The JS suite is the acceptance suite; port must pass bit-identical replay tests |
| Entry-fee prize model challenged | Track separation; Track B only after per-market counsel + geo-block + KYC + escrow |
| Apple/Google rejection | Track A unambiguous; Track B pre-reviewed as skill competition; SIWA + deletion + guest compliance from day one; soft-launch build ships all store requirements |
| 8 Ball Pool network effect | Wedge = their veterans: real physics, no cheaters, national identity |
| Poor connections | Adaptive interpolation to 250ms, 30s reconnect, latency-aware matchmaking |
| Thermal throttling | Governor degrades resolution/effects before frame rate, always |
| Coin economy exploited | Daily caps, non-transferable, audited log, rate limits, no ads-to-coins |
| Guest abuse | Guests never touch ranked/tournaments; fingerprinting; Starter-pack cap |
| Country-hopping | 180-day lock; Cup normalised per active players |
| Prize shortfall | Entries + platform guarantee from escrow; conservative advertising |
| KYC drop-off | KYC only on Track B withdrawals; everyone else never sees it |

---

## 17. SUCCESS METRICS (LAUNCH TARGETS)

| Metric | Target |
|--------|--------|
| D1 / D7 / D30 retention | 45% / 22% / 10% |
| Guest → sign-in conversion | ≥ 35% by D7 |
| Crash-free sessions | ≥ 99.7% |
| 60fps-floor compliance | ≥ 97% of sessions on supported devices |
| Median matchmaking time | ≤ 15s at 10k DAU |
| Ranked participation (signed-in) | ≥ 55% |
| Track A weekly participation | ≥ 20% of WAU |
| ARPDAU | ≥ $0.06 by Month 3 |
| Country Cup participation | ≥ 40% of ranked players monthly |

---

## APPENDIX A — REFERENCE IMPLEMENTATION STATUS (2026-08-27)

Lives in `game/`. Playable, tested, deterministic.

| System | State | Evidence |
|--------|-------|----------|
| Physics (all §4 systems) | Complete | 22 physics checks; cited constants; bit-identical replays |
| WPA 8-ball rules | Complete | 28 checks + 60-rack fuzz through every loss condition |
| Rendering (tiers 1–3 look) | Complete | Deterministic 3200×1800 harness frames in `refs/out/` |
| Audio (modal synthesis) | Complete | Offline-rendered peaks/lengths measured; flatness 0.0003–0.006 |
| Match UX (VS intro, stroke, ring, trays, spin picker) | Complete | 19 E2E checks drive the real UI, incl. full racks via the release gesture |
| AI bot (geometric core) | Working | Plays complete legal racks in the fuzz/E2E suites |
| Shot harness + UI test rig | Complete | `tools/shots.mjs`, `tools/uitest.mjs` |
| Multiplayer, accounts, economy | Not started | Phase 2–3 |

Competitive teardown that validated the interaction set: `refs/competitor-8bp-analysis.md`.
Product sequencing detail: `ROADMAP.md`.

*— End of GDD v3.1 —*
