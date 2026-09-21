# CueMaster

React Native / Expo 57 mobile pool game with an original Blender table, shared TypeScript physics, and a MongoDB-backed club. Web is a local inspection surface for the same app, not the target release platform.

## Run on this Mac

```sh
npm --prefix mobile ci
npm --prefix server ci
npm run dev
```

The launcher starts an isolated local MongoDB on `127.0.0.1:27028`, the API on `127.0.0.1:4000`, and Metro on `8081`. MongoDB files live in `.data/mongo`. It reuses existing services and only stops processes it started. MongoDB must be installed (`mongod` is already available on this Mac).

Open <http://localhost:8081>. Guest play works without OAuth keys. The native app uses custom native modules and needs a development build, not Expo Go.

- `npm run ios` / `npm run android`: build and launch the native app; keep the API running.
- `npm run check`: mobile/server TypeScript, 34 physics/session tests, and API integration tests. Start `npm run dev` first; API tests create and remove only their own test account.
- `npm run api`: API only. Reads `server/.env` when run this way.
- `npm --prefix mobile run benchmark`: desktop simulation benchmark; not a mobile frame-rate certification.

For Atlas, set `MONGODB_URI` and `MONGODB_DB` in `server/.env` using `server/.env.example`. Do not put database credentials in mobile environment variables. Physical phones need a reachable API URL; see [service setup](docs/SERVICES.md).

## Available flows

- Branded native splash, Blender opening artwork, guest entry and a club home. Offline practice remains accessible when the API is unavailable.
- Profile name, country, two original avatars, persistent account progress and account deletion.
- Six table finishes with server-enforced level locks and saved equipment selection.
- Six practice challenges, verified first-clear XP/coins, repeatable free practice, daily gifts.
- Free Precision Open preseason event, server-replayed scores, persistent leaderboard, one-time coin reward.
- Weekly Pro and USDC Masters event pages with announced status and closed entries.
- Native Google sign-in and iOS Apple sign-in integration, with server-side identity-token verification; provider configuration still required.

Drag cloth to aim, pull the left power handle down and release to shoot. Returning to zero cancels. Spin opens the cue-ball picker. The menu contains camera, practice, collection, restart and return-to-club controls.

## Art and implementation

`mobile/assets/models/cuemaster-table.blend` and `mobile/assets/lounge/lounge.blend` are editable originals. Rebuild table and club images with `tools/build_table.py` and `tools/build_lounge.py` using Blender's background mode. `tools/build_details.py` creates original procedural ball textures and audio; it requires Pillow.

`mobile/src/app` contains club screens, API client and provider integration. `mobile/TableGame.tsx` contains the match screen. `server/src/catalog.ts` defines progression, venues and events. `server/src/verify.ts` replays the same engine used by the client before granting rewards.

## Release boundary

This is a working local club/practice/preseason build. Online opponents, regulation competitive foul adjudication, live brackets, paid skin purchases, wallet custody and crypto payouts are not implemented. No funds are collected. Google/Apple live login needs owner-controlled OAuth/App ID setup. See [service setup](docs/SERVICES.md) and [validation](docs/VALIDATION.md) for exact checks and remaining gates. Historical GDD claims about deleted code do not describe this build.
