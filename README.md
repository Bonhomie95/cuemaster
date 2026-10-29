# CueMaster

React Native / Expo 57 mobile pool game with an original Blender table, shared TypeScript physics, and a MongoDB-backed club. Web is a local inspection surface for the same app, not the target release platform.

## Run on this Mac

```sh
npm --prefix mobile ci
npm --prefix server ci
npm run dev
```

The launcher starts an isolated local MongoDB on `127.0.0.1:27028`, the API on `127.0.0.1:4000`, and Metro on the first free port from `8081` (it prints the URL, and tells the API to accept that origin; another project holding 8081 used to serve the wrong app here). Set `WEB_PORT` to pin it. MongoDB files live in `.data/mongo`. It reuses existing services and only stops processes it started. MongoDB must be installed (`mongod` is already available on this Mac).

Open the printed preview URL. Guest play works without OAuth keys. The native app uses custom native modules and needs a development build, not Expo Go.

- `npm run ios` / `npm run android`: build and launch the native app; keep the API running.
- `npm run check`: mobile/server TypeScript, 78 physics/session/rule tests, and 22 API suites. Start `npm run dev` first (the suites need its MongoDB on 27028); API tests create and remove only their own test accounts.
- `npm run api`: API only. Reads `server/.env` when run this way.
- `npm --prefix mobile run benchmark`: desktop simulation benchmark; not a mobile frame-rate certification.

For Atlas, set `MONGODB_URI` and `MONGODB_DB` in `server/.env` using `server/.env.example`. Do not put database credentials in mobile environment variables. Physical phones need a reachable API URL; see [service setup](docs/SERVICES.md).

## Render and simulator troubleshooting

The API is hosted at `https://cuemaster-api.onrender.com`. Its public health check is
`https://cuemaster-api.onrender.com/health`; a healthy response is
`{"ok":true,"database":"mongodb"}`. A free Render service sleeps when idle, so the app allows
65 seconds for its initial catalog/config connection. Subsequent requests retain their normal
timeout. The table models and ball textures are bundled in the app and do not download from Render.

The Render CLI on this Mac is already authenticated. To inspect this service:

```sh
render whoami
render services --output json
render logs --resources srv-db1nu85g1s2s73b2tbt0 --limit 30 --output text
render deploys list srv-db1nu85g1s2s73b2tbt0 --output json
```

If authentication expires, run `render login` and complete the sign-in in your browser.
Do not paste Render API keys or database passwords into chat. The dashboard is
[CueMaster API](https://dashboard.render.com/web/srv-db1nu85g1s2s73b2tbt0).

Render settings: repository root directory empty, build `npm --prefix server ci`, start
`npm --prefix server start`, health check `/health`. Keep the repository root available:
the API imports shared physics and rules from `mobile/src`. Set `HOST=0.0.0.0` (the code also
defaults to this on Render), and let Render provide `PORT`. Production requires the database,
CORS, proxy trust and legal settings in `server/.env.example`; store them in Render's Environment
tab. `mobile/.env` leaves `EXPO_PUBLIC_API_URL` empty so local builds use the `npm run dev` API;
set it to `https://cuemaster-api.onrender.com` there for phone testing against the hosted API and
in your mobile build environment, then rebuild the app after changing it.

For native testing, use a development build rather than Expo Go. Regenerate/build native code
with `npm run ios` or `npm run android`; Metro refresh cannot update native startup code.
The iOS config plugin enables Expo's scene lifecycle, required for iOS 27. Native rendering skips
the floating-point room-reflection bake and multisample antialiasing to avoid blocking software
simulator graphics. The loading message waits for actual scene draws. If native graphics have
not started after 12 seconds, the app switches to a GL-independent compatibility table with
the same physics, aiming, placement and shooting controls. **Retry 3D** restarts the standard
view. Native debug checks never read pixels synchronously from EXGL. Keep remote JavaScript
debugging disabled when testing Expo GL.

## Available flows

- **Online 1 vs 1** (`server/src/live.ts`, `mobile/src/game/online.ts`): players waiting at the same venue are paired over a WebSocket; the server replays every shot on the shared engine and sends both phones the resulting table, owns the shot clock, and settles the pot (both entries), a crate, XP and trophies in one write. Rematch, quick chat (six fixed lines), a 45-second return window after a dropped connection, and a refund when both players vanish. When nobody is waiting the player is offered a computer opponent, labelled HOUSE.
- **Friend tables**: a five-letter room code, shared as a tappable `https://<api>/join/CODE` link that opens the app (`server/src/links.ts`).
- **Invite codes**: both players get 500 coins and 10 rubies once the newcomer finishes three matches (`server/src/invites.ts`).
- **Daily loop** (`server/src/daily.ts`, `mobile/src/app/DailyRewards.tsx`): a 7-day login streak, free coins every four hours, a daily prize wheel (+3 video spins), three daily missions with a bonus crate, and the 28-day CueMaster Pass (30 tiers, free and premium tracks). Local reminders for crates, free coins and lapsed players (`mobile/src/app/notify.ts`).
- **Lucky Shot** (Daily rewards → Lucky Shot, or the home's Daily rewards button while a shot waits): one free shot a day plus one per rewarded video (two a day) at a fixed layout, the cue ball alone on the head spot and four prize rings round the centre spot. The app sends the shot as it is struck; the referee worker replays it on the shared engine and pays the ring the cue ball stops in (bullseye 1,000 coins + 5 rubies, then a Silver crate, 200 and 50 coins), so it is a skill shot with no random draw. The rings are one table (`LUCKY` in `mobile/src/physics/engine.ts`) that the table draws, the server judges by and `/legal/odds` lists.
- **Weekly leagues** (`server/src/leagues.ts`, More → Leagues): a player's first matchmade online result of the week puts them in that week's league at their tier (Bronze to Diamond), grouped up to 50 by trophies and ranked by coins won from online pots. From Monday 00:00 UTC the top 10 of a full league move up and earn their league's crate and the bottom 10 drop (a fifth each way in a smaller league). Each player's week settles lazily on their first request after it ends, in one write keyed on the week, so it pays once. Friend rooms do not count toward leagues.
- **Shop** (`mobile/src/app/Shop.tsx`): coin packs, ruby packs, a one-time starter pack, the season's premium pass, the piggy bank, and three free-coin videos a day.
- **Piggy bank**: every finished online or computer match drops coins into a locked bank (100 a win, 40 a loss, up to 5,000) in the result's own write. The shop shows what it holds; `piggy.break`, a consumable credited through the same `/store/claim` verification, pays out whatever it holds at that moment and empties it. It is offered from 1,000 coins up.
- **Home and menus**: picture cards for each way to play, daily rewards and the shop in side columns, everything else under More (profile, leaderboard by trophies or level, weekly leagues, invites, tournaments, practice, tables, cues, settings, How to play). New players pick a name and flag, and get a three-step coaching overlay on their first table.
- **Sound**: every table and interface sound is synthesised by `tools/build_sounds.py`; one switch in Settings silences both.
- Branded native splash, Blender opening artwork, guest entry and a club home. Offline practice remains accessible when the API is unavailable.
- Profile name, country, two original avatars, persistent account progress and account deletion.
- Six table finishes with server-enforced level locks and saved equipment selection.
- Six practice challenges, verified first-clear XP/coins, repeatable free practice, daily gifts.
- Reward crates: a win seals one of six crate tiers, four slots, one unlock at a time, opened on the timer, up to three videos (an hour each), or early with rubies at one ruby per hour left; a premium pass halves every timer. Contents are rolled when the crate is earned, so a paid speed-up only buys time, and the odds are published at `/legal/odds`.
- Two currencies: coins, the soft currency, pay entry fees, cues and tables; rubies, the premium currency, open crates early. Real money buys both, plus a one-time starter pack and the season's premium pass, through Apple and Google billing only. Purchases stay off until `STORE_BILLING` is set.
- Optional rewarded video takes an hour off a crate. It ships on Google's public AdMob test units, and the hour is granted by AdMob's signed server callback, never by the device. Non-personalised ads only; no advertising identifier, no tracking prompt.
- Coin competitions with optional coin entry fees, server-replayed scores, a persistent leaderboard, and ranked coin prizes that settle automatically when the event closes.
- Weekly Pro and USDC Masters event pages with announced status and closed entries.
- Native Google sign-in and iOS Apple sign-in integration, with server-side identity-token verification; provider configuration still required.

- Daily Shot: one seeded layout a day, identical for everyone, scored by fewest verified shots. The leader's run plays beside you as a translucent ghost cue ball. 50 XP on the first verified run each day.
- City trick-shot packs: two referee-verified layouts per venue. Clearing both stamps the city in the practice-lab passport.
- XP for verified play: re-clearing any drill pays 20 XP (ten a day), event entries pay 100 XP once, so progression no longer stops at level 7.
- Open competitions can run on any drill the referee can replay; the admin console has a drill picker.
- CPU wins are verified: the device records the player's actions, the server replays the whole rack with the rival's shots regenerated from the match seed, and only a confirmed win seals a crate.
- Replay codes: Table settings → The practice room shares the current run as a `CM1:` code and plays a pasted one. Shared runs never count as the viewer's own.
- Eight rivals each have a playing style the planner uses (safe, steady, power, spin) and a motto on the match card.
- Physics coach: after a missed practice shot the footer says what the engine saw, in degrees off the nearest pocket, with aim-fuller or aim-thinner advice.
- Living landmarks: each city inlay carries an animated light, and London keeps its clock hand.

Drag cloth to aim, turn the AIM wheel on the right for fine corrections, pull the cue on the left down and release to shoot. Returning to zero cancels. Spin opens the cue-ball picker. The menu contains camera, practice, collection, restart, replay and return-to-club controls. After an unranked shot, ▶ REPLAY re-runs it in slow motion.

## Art and implementation

`mobile/assets/models/cuemaster-table.blend` and `mobile/assets/lounge/lounge.blend` are editable originals. Rebuild table and club images with `tools/build_table.py`, `tools/build_lounge.py` and `tools/build_hero.py` (welcome art) using Blender's background mode. `tools/build_details.py` creates the ball-number masks (Pillow). `tools/build_icons.py` renders the coin, ruby, pack, crate, gift and pass art from Blender primitives (`blender -b --python tools/build_icons.py`), and `tools/build_sounds.py` synthesises every sound (numpy).

`node tools/ui-walk.mjs` (with `npm run dev` running) plays the whole app in headless Chrome as two players: every page, the daily systems (Lucky Shot included), the shop and piggy bank, a computer match, an online match between the two players (checking both phones end on the same table), a friend room, and the weekly league both players land in. It fails on any console error or missing control; `--store` saves store-size screenshots to `artifacts/store-screenshots/`.

`mobile/src/app` contains club screens, API client and provider integration. `mobile/TableGame.tsx` contains the match screen. `server/src/catalog.ts` defines progression, venues and events. `server/src/verify.ts` replays the same engine used by the client before granting rewards.

## Public pages

The API serves the pages both stores require, at `/legal/privacy`, `/legal/terms`,
`/legal/support` and `/legal/delete-account`, all linked from Profile → Legal & support. They
show a draft banner until `PUBLIC_BASE_URL`, `PUBLIC_SUPPORT_EMAIL` and `PUBLIC_POLICY_DATE`
are set, and production start-up refuses to run without them.

A release build whose `EXPO_PUBLIC_API_URL` is not HTTPS refuses every request and says so on
screen, rather than appearing to work and then failing in review.

## Ads and purchases

`mobile/app.json` holds the AdMob identifiers in its `react-native-google-mobile-ads` block —
one place, read by both the Android gradle plugin and the app. They default to Google's public
test units so the whole flow runs today; a release build refuses to compile until they are
replaced. Point each rewarded unit's server-side verification at `https://<api>/ads/reward`.

Purchases go through `expo-iap` (`mobile/src/app/billing.ts`) and are credited only by
`POST /store/claim` in `server/src/store.ts`, which verifies each StoreKit 2 transaction offline
against Apple's root certificate and each Play purchase with the Play Developer API, then
credits it exactly once. `STORE_BILLING` lists the enabled platforms (`ios`, `android`);
Android also needs `GOOGLE_PLAY_SERVICE_ACCOUNT`. A platform that is not enabled answers 503 and
credits nothing. Store setup is in [what only you can do](docs/release/OWNER-CHECKLIST.md).

## Administration

`http://localhost:4000/admin/` is a separate console with its own accounts. The owner can
create, edit, publish, close and delete tournaments; deletion is blocked while an event is open
or once players have entered, and every deletion is kept in a permanent audit log. See
[administration](docs/release/ADMIN.md).

## Release boundary

Online 1 vs 1 and friend tables are live; live brackets, clubs, paid skin purchases, wallet custody and crypto payouts are not implemented. The match server keeps queues and tables in one process's memory: run a single always-on instance (Render's free plan sleeps and is not suitable for launch). No funds are collected. Google/Apple live login needs owner-controlled OAuth/App ID setup. See [service setup](docs/SERVICES.md) and [validation](docs/VALIDATION.md) for exact checks and remaining gates. Historical GDD claims about deleted code do not describe this build.
