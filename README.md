# 🎱 CueMaster

> Competitive online pool — real physics, real prizes, real skill.

---

## Project Structure

```
cuemaster/
├── shared/              # Shared TypeScript types & constants (zero runtime deps)
│   └── src/
│       ├── types/       # user.ts · game.ts · coin.ts · tournament.ts
│       ├── constants/   # Table dimensions, physics, ELO, thresholds
│       └── index.ts
├── admin/               # React + Vite + TS — Dashboard & moderation panel
├── mobile/              # React Native + Expo — iOS & Android game client
└── server/
    ├── api/             # Express + TypeScript — REST API (auth, profiles, economy)
    └── game/            # Colyseus — Real-time WebSocket match rooms
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile client | React Native + Expo (iOS & Android) |
| Admin dashboard | React + Vite + TypeScript |
| REST API | Express + TypeScript |
| Game server | Colyseus (WebSockets) |
| Database | MongoDB + Mongoose |
| Physics engine | Matter.js + custom billiard layer *(Phase 2)* |
| 3D renderer | Three.js / React Three Fiber *(Phase 4)* |
| Payments | RevenueCat (IAP) + Coinbase Commerce (crypto prizes) |
| KYC | Stripe Identity |
| Infrastructure | AWS + Cloudflare |

---

## Build Phases

| Phase | Scope | Status |
|---|---|---|
| **1** | Foundation — shared types, auth, MongoDB, Colyseus skeleton | 🔨 In Progress |
| **2** | Physics engine — Matter.js + billiard layer (spin, english, cushion) | ⏳ Pending |
| **3** | Multiplayer rooms — full Colyseus lifecycle, lag compensation | ⏳ Pending |
| **4** | 3D renderer — React Three Fiber, PBR shaders, felt, particles | ⏳ Pending |
| **5** | Auth, profiles, coin economy, RevenueCat IAP | ⏳ Pending |
| **6** | Tournament engine — brackets, leaderboards, crypto prizes | ⏳ Pending |
| **7** | Admin panel — live monitoring, KYC queue, financials | ⏳ Pending |
| **8** | Compliance — anti-cheat, geo-blocking, responsible gaming | ⏳ Pending |
| **9** | Beta, load testing, App Store / Play Store launch | ⏳ Pending |

---

## Getting Started

```bash
# 1. API server
cd server/api
cp .env.example .env      # fill in values
npm install
npm run dev               # http://localhost:4000

# 2. Game server
cd server/game
cp .env.example .env
npm install
npm run dev               # ws://localhost:2567

# 3. Admin dashboard
cd admin
npm install
npm run dev               # http://localhost:5173

# 4. Mobile app
cd mobile
npm install
npx expo start
```

---

## Architecture Notes

- **Server-authoritative physics** — clients send only `{ aimAngle, power, spinX, spinY }`. No ball positions ever come from the client.
- **Two-service backend** — `server/api` is stateless REST. `server/game` is stateful WebSocket (Colyseus). Both share MongoDB.
- **Shared types** — `shared/src` contains zero-dependency TypeScript types and constants used by all four workspaces. Copy the compiled output or reference via path alias.
- **Input-only replays** — shot sequences (~5KB per match) are stored for deterministic replay and anti-cheat audit.
- **Coin model** — coins are not redeemable for cash. Prize pools are funded from platform revenue and paid out as USDC (skill competition, not gambling).

---

*CueMaster Blueprint v2.0 — Confidential*
