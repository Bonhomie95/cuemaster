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
- `npm run check`: mobile/server TypeScript, 64 physics/session/rule tests, and 14 API integration suites. Start `npm run dev` first; API tests create and remove only their own test account.
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

- Branded native splash, Blender opening artwork, guest entry and a club home. Offline practice remains accessible when the API is unavailable.
- Profile name, country, two original avatars, persistent account progress and account deletion.
- Six table finishes with server-enforced level locks and saved equipment selection.
- Six practice challenges, verified first-clear XP/coins, repeatable free practice, daily gifts.
- Reward crates: a win seals one of six crate tiers, four slots, one unlock at a time, opened on the timer or early with rubies. Contents are rolled on the server and the odds are published in the app.
- Two currencies: coins are earned and pay for everything that affects play; rubies are a scarce bonus and the only thing real money buys. Ruby purchases stay disabled until store billing is configured.
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

Drag cloth to aim, pull the left power handle down and release to shoot. Returning to zero cancels. Spin opens the cue-ball picker. The menu contains camera, practice, collection, restart, replay and return-to-club controls. After an unranked shot, ▶ REPLAY re-runs it in slow motion.

## Art and implementation

`mobile/assets/models/cuemaster-table.blend` and `mobile/assets/lounge/lounge.blend` are editable originals. Rebuild table and club images with `tools/build_table.py`, `tools/build_lounge.py` and `tools/build_hero.py` (welcome art) using Blender's background mode. `tools/build_details.py` creates original procedural ball textures and audio; it requires Pillow.

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

Ruby purchases need `STORE_BILLING` and an implementation of `verifyPurchase()` in
`server/src/store.ts`. Until then the endpoint returns 503 and credits nothing. Full list in
[what only you can do](docs/release/OWNER-CHECKLIST.md).

## Administration

`http://localhost:4000/admin/` is a separate console with its own accounts. The owner can
create, edit, publish, close and delete tournaments; deletion is blocked while an event is open
or once players have entered, and every deletion is kept in a permanent audit log. See
[administration](docs/release/ADMIN.md).

## Release boundary

This is a working local club/practice/preseason build. Online opponents, regulation competitive foul adjudication, live brackets, paid skin purchases, wallet custody and crypto payouts are not implemented. No funds are collected. Google/Apple live login needs owner-controlled OAuth/App ID setup. See [service setup](docs/SERVICES.md) and [validation](docs/VALIDATION.md) for exact checks and remaining gates. Historical GDD claims about deleted code do not describe this build.
