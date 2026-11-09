# Upload CueMaster: the first release

Everything needed for the first Google Play and App Store upload, in order. **You** marks steps
that need your own accounts, payment details or passwords. Written 2026-11-09; the store rules it
relies on were checked that day (sources at the end). The reference behind it, with more detail
on each service, is `docs/release/OWNER-CHECKLIST.md` in the main checkout.

## Ready now

- **Android upload file:** `cuemaster-1.0.0-2-closed-test.aab` (version 1.0.0, version code 2),
  in `artifacts/release/upload/` with the store pictures. Signed with your upload key in
  `~/.cuemaster-release/`: copy that folder into your password manager, and keep the `.aab`
  somewhere safe too. It uses Google's test adverts, which is right for a testing track.
- **Store pictures** (same folder): 8 captioned Google Play screenshots (1920×1080), the Play
  feature graphic (1024×500) and icon (512×512), and 8 App Store screenshots for the 6.9″ iPhone
  (2868×1320). All are the real game.
- **Live server and policy pages** at `https://cuemaster-api.onrender.com`: privacy, terms,
  support, account deletion and reward odds under `/legal/`. The update with the 14 cities
  (250 to a billion), the city unlocks and the video fixes went live on 9 November.
- **Expo project** `bonhomie95/cuemaster` is created and linked, and the first iPhone build
  (`beta` profile) was started from this Mac with `--auto-submit`, so it goes to TestFlight by
  itself once you have signed in to Apple in the Terminal.
- **iPhone only** for this release, so no iPad screenshots are needed (iPads run it in iPhone
  mode). **Guest play only** until you set up Google or Apple sign-in: the sign-in buttons stay
  hidden until then, which both stores accept. **Paid packs stay hidden** on a platform until
  purchases are switched on for it (section 5), so the shop never shows prices it cannot sell.

## 1. Three quick setups (about 30 minutes, You)

1. **Keep the server awake.** dashboard.render.com → `cuemaster-api` → Settings → Instance type
   → **Starter** (about $7 a month). On the free plan the server sleeps after 15 idle minutes
   and every online match in progress breaks.
2. **AdMob (free).** admob.google.com → sign in → Apps → Add app → Android → "not listed on an
   app store yet" → name `CueMaster` → copy the **App ID** (looks like `ca-app-pub-…~…`). Then
   Ad units → Add ad unit → **Rewarded** → name `Crate video` → copy the **Ad unit ID** (looks
   like `ca-app-pub-…/…`). Do the same for iOS. Open each rewarded unit → Server-side
   verification → callback URL `https://cuemaster-api.onrender.com/ads/reward`. Send me the four
   IDs; they are not secret.
   Until those IDs are in, the test builds play Google's sample videos, which never call the
   server back, so a watched video would pay nothing. `ADS_CLIENT_REDEEM` = `1` is therefore set
   in Render → `cuemaster-api` → Environment (since 9 November) so testers' videos pay; delete it
   when the build with your own IDs ships.
3. **Expo account (free).** expo.dev/signup. Expo's cloud builds and signs the iPhone app for the
   App Store, so you never handle Apple certificates yourself.

## 2. Google Play (start today)

**Personal or organization account?** Play Console → Settings → Developer account → Account
details. A personal account created after 13 November 2023 must run a **closed test with at
least 12 testers opted in for 14 days in a row** before Play allows a public release, so start
it today. An organization account (registered with a D-U-N-S number) skips that rule.

1. **Create the app:** Home → Create app → name `CueMaster: 3D Pool Billiards` → language
   English (United States) → **Game** → **Free** → tick the declarations → Create app.
2. **App content** (Policy → App content; the dashboard lists each task):
   - Privacy policy: `https://cuemaster-api.onrender.com/legal/privacy`
   - App access: all functionality is available without special access
   - Ads: **Yes**, my app contains ads
   - Content rating: category Game. No violence, sexual content, drugs or real-money gambling.
     Players see each other's names and can send six preset chat lines, with no free-text chat.
     In-app purchases: yes. Crates are random rewards earned by playing; they are never sold.
   - Target audience: **18 and over** only
   - News app: no. Government app: no. Financial features: none. Health: no.
   - Advertising ID: **No** (the permission is removed from the app)
   - Data safety: see "Privacy answers" below
   - Data deletion: `https://cuemaster-api.onrender.com/legal/delete-account`
3. **Main store listing** (Grow users → Store presence → Main store listing): app name, short
   description and full description from "Store text" below; app icon; feature graphic; the 8
   phone screenshots. Store settings: category **Games → Sports**, your contact email.
4. **Upload the test build:**
   - **Personal account:** Test and release → Testing → **Closed testing** → create a track →
     add your countries → Testers: create an email list with **12 or more Gmail addresses** →
     Create new release → when asked about signing, choose **Google-generated key (Play App
     Signing)** → upload the `.aab` → release name `1.0.0 (2)` → Next → Save → send for review.
     When Google approves it, copy the opt-in link from the Testers tab and send it to your
     testers: each opens it, taps "Become a tester", then installs CueMaster from Play. Keep at
     least 12 opted in for 14 days in a row, then choose **Apply for production** on the
     dashboard and answer its short questions.
   - **Organization account:** Test and release → Testing → **Internal testing** → create a
     release with the same file → add yourself as a tester → install and check → then
     Production (step 6).
5. **In-app products** (Monetize with Play → Products → In-app products): Play first asks for a
   payments profile (bank and tax details, You). Then create the 12 products in the table below
   with exactly these ids, set each price, and **Activate**. Then section 5.
6. **Production release:** this needs a build with your own AdMob IDs (version code 3); I make
   it when you send them. Then Test and release → Production → Create new release → upload →
   roll out.

## 3. Apple App Store

1. **Agreements, tax and banking (You):** App Store Connect → Business → accept the **Paid Apps
   Agreement** → add a bank account → complete the tax forms. Apple will not sell coins or
   rubies until this is active, which can take a few days.
2. **Create the app:** Apps → + → New App → iOS → name `CueMaster: 3D Pool Billiards` → primary
   language English (U.S.) → bundle ID `com.bonhomie.cuemaster` → SKU `cuemaster-ios` → Full
   access → Create. If the bundle ID is not offered yet, do step 3 first; EAS registers it.
3. **Build the iPhone app (started for you; You only sign in):** the Terminal tab "iPhone build"
   runs `npx eas-cli build -p ios --profile beta --auto-submit` in `mobile/`. Answer **Yes** to
   logging in to your Apple account (Apple ID, password, two-factor code), pick **Bonhomie LLC**,
   and accept the defaults to create the distribution certificate, the provisioning profile and
   an App Store Connect API key. If it asks for an app name, use `CueMaster: 3D Pool Billiards`.
   The build runs in Expo's cloud (the Terminal shows a link to follow it), then uploads itself
   to App Store Connect; Apple processes it in 10–30 minutes and emails you. To run it again
   later, use the same command. The `beta` profile keeps Google's test adverts, which is right
   for TestFlight; the build you send to App Review uses `--profile production`, after your
   AdMob IDs are in the app.
4. **TestFlight:** your app → TestFlight → Internal Testing → + → add yourself → install the
   TestFlight app on your iPhone → open the invite → install CueMaster.
5. **In-app purchases:** your app → Monetization → In-App Purchases → + → type **Consumable** →
   reference name → product ID from the table → Create → price → App Store localization
   (display name and description) → review screenshot (any picture of the shop) → Save. All 12
   are reviewed together with version 1.0.
6. **App Privacy:** your app → App Privacy → see "Privacy answers" below. Privacy policy URL:
   `https://cuemaster-api.onrender.com/legal/privacy`.
7. **Age rating:** App Information → Age Rating. Apple's ratings are now 4+, 9+, 13+, 16+ and
   18+. Answer truthfully: no violence, sexual content or drugs; no real-money gambling; the free
   daily prize wheel and earned reward crates are mild simulated gambling; chat is six preset
   lines only. Then choose **18+**, which matches the game's own age gate.
8. **Version 1.0 page:** the 8 screenshots under "iPhone 6.9″ Display"; subtitle, description
   and keywords from "Store text"; support URL `https://cuemaster-api.onrender.com/legal/support`;
   copyright `2026 Bonhomie LLC`; Build → choose the production build; In-App Purchases → add all
   12; App Review Information → sign-in required **No**, your name, phone and email, and paste
   the review notes; Version Release → **Manually release this version**. Also App Information →
   category Games → Sports (secondary Board), and Pricing and Availability → Free. Then **Add
   for Review → Submit for Review**. Review usually takes one to three days.

## 4. Send me

1. The four AdMob IDs (two app IDs, two rewarded unit IDs).
2. Whether your Play account is personal or organization.
3. "Products are created" for each store, so purchases can be switched on.
4. Later, if you turn on sign-in: the Google iOS client ID and URL scheme (section 6).

With the AdMob IDs I put them in the app, build the production Android file (version code 3),
and you run `npx eas-cli build -p ios --profile production` then `submit` again.

## 5. Switching purchases on (after the products exist)

- **Android:** Google Cloud Console → APIs & Services → Library → enable **Google Play Android
  Developer API** → IAM & Admin → Service Accounts → create one → Keys → Add key → JSON. Then
  Play Console → Users and permissions → Invite new users → the service account's email, with
  **View financial data** and **Manage orders and subscriptions** for CueMaster. Put the whole
  JSON file's contents in Render → `cuemaster-api` → Environment → `GOOGLE_PLAY_SERVICE_ACCOUNT`.
- **Both:** Render → Environment → `STORE_BILLING` = `ios,android` (or only the one that is
  ready). The starter pack, the pass's unlock button and the shop's packs then appear on that
  platform with no app update.
- **Test with fake money first:** iOS: App Store Connect → Users and Access → Sandbox → add a
  sandbox tester, then buy on the TestFlight build. Android: Play Console → Settings → License
  testing → add your Gmail, then buy on the testing-track build. Buy one of each kind, and close
  the app in the middle of a purchase once: it must still arrive, once.

## 6. Google and Apple sign-in (optional, any time)

Guest play is enough to launch: both stores accept it, and a guest keeps their progress on their
own phone. Sign-in lets a player keep it across phones. The buttons appear by themselves once
the server has the keys below; on iPhone, Google shows only beside Sign in with Apple, which is
Apple's rule (4.8).

**Apple (iPhone).**

1. developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → + → name
   `CueMaster Sign in with Apple` → tick **Sign in with Apple** → Configure → App ID
   `com.bonhomie.cuemaster` → Save → Continue → Register → **Download** the `.p8` file (Apple
   lets you download it once) and note its **Key ID**. Your **Team ID** is under Membership.
2. Render → `cuemaster-api` → Environment, add `APPLE_CLIENT_IDS` = `com.bonhomie.cuemaster`,
   `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` = the whole text of the `.p8` file.
   Paste the `.p8` only into Render, never into chat or email: the server uses it to cancel a
   player's Apple sign-in when they delete their account, which Apple requires.
3. Nothing else: the app already asks for Sign in with Apple, and the Expo build switches the
   capability on for the App ID.

**Google (Android, and iPhone once Apple is on).**

1. console.cloud.google.com → create a project `CueMaster` → APIs & Services → **OAuth consent
   screen** → External → app name `CueMaster`, your support email, privacy policy
   `https://cuemaster-api.onrender.com/legal/privacy` → publish it.
2. Credentials → Create credentials → **OAuth client ID**, three times:
   - **Web application**, name `CueMaster server`. Copy its Client ID.
   - **Android**, package `com.bonhomie.cuemaster`, SHA-1
     `B3:73:F3:15:79:B4:8C:94:FA:C9:9D:C4:2D:FD:B5:21:BF:DF:5D:F1` (your upload key). After the
     first Play upload, add a second Android client with the **App signing key** SHA-1 from
     Play Console → Test and release → App integrity: that is the key Play signs installs with.
   - **iOS**, bundle ID `com.bonhomie.cuemaster`. Copy its Client ID and its **iOS URL scheme**.
3. Render → Environment: `GOOGLE_CLIENT_IDS` = the web, Android and iOS client IDs separated by
   commas, and `GOOGLE_WEB_CLIENT_ID` = the web one.
4. Send me the iOS client ID and iOS URL scheme (they are not secret); I add them to the iPhone
   build.

## Products

The same ids in both stores, all **Consumable** in App Store Connect and one-time products in
Play. The server enforces "once per account" for the starter pack and "this season" for the pass.

| Product id       | Gives                                                            | Price  |
| ---------------- | ---------------------------------------------------------------- | ------ |
| `rubies.handful` | 20 rubies                                                        | $0.99  |
| `rubies.pouch`   | 110 rubies (+10%)                                                | $4.99  |
| `rubies.chest`   | 240 rubies (+20%)                                                | $9.99  |
| `rubies.vault`   | 650 rubies (+30%)                                                | $24.99 |
| `rubies.hoard`   | 1,400 rubies (+40%)                                              | $49.99 |
| `coins.pile`     | 2,000 coins                                                      | $0.99  |
| `coins.stack`    | 11,000 coins (+10%)                                              | $4.99  |
| `coins.bag`      | 24,000 coins (+20%)                                              | $9.99  |
| `coins.vault`    | 65,000 coins (+30%)                                              | $24.99 |
| `starter.pack`   | 5,000 coins + 60 rubies, once per account                        | $1.99  |
| `pass.premium`   | The pass's premium track for the current season                  | $4.99  |
| `piggy.break`    | Every coin in the player's piggy bank (sold from 1,000 coins up) | $0.99  |

## Store text

- **Name (both):** `CueMaster: 3D Pool Billiards`
- **Play short description:** `8-ball pool from Lagos to Monaco: win your way up to the billion-coin table.`
- **App Store subtitle:** `8 Ball Online, Real Physics`
- **App Store keywords:** `8ball,cue,snooker,billiard,multiplayer,friends,trick,shot,spin,offline,classic,table,stick,club`
- **Category:** Games → Sports (App Store secondary: Board)
- **Never** use another game's name (such as "8 Ball Pool") in store text.

**Full description (both stores):**

```
Start in Lagos. Finish in Monaco. CueMaster is 3D 8-ball pool across fourteen cities, each
table harder to reach than the last, up to a final table where the entry is a billion coins.
Every shot behaves the way it would on the felt: draw, follow and side spin change each
rebound, cushions grip, and a ball struck slightly off line rattles in the jaws.

PLAY ONLINE
• 1v1 8-ball online: the winner takes the pot
• Invite a friend to a private table with a code or a link
• Rematch, quick chat and trophies for every win

PLAY YOUR WAY
• House rivals that adapt to your form when you want a quick rack
• 2-player pass & play on one phone
• Practice drills for cut shots, spin and clearing the table, and free play offline

FOURTEEN CITIES, ONE BILLION-COIN TABLE
Lagos, London, Paris, Tokyo, Dubai, New York, Cape Town, Rio de Janeiro, Cairo, Mumbai, Rome,
Sydney, Singapore and Monaco, each with its own table, landmark and trick shots. Coins are not
enough: win at one city to open the next, and climb from a 250-coin entry to a billion.

EVERY DAY THERE IS SOMETHING TO WIN
• Daily login rewards, free coins every four hours and a free spin of the prize wheel
• The Lucky Shot: stop the cue ball in the rings to win coins, rubies or a crate
• Three daily missions and the season CueMaster Pass
• The Daily Shot: the same layout for everyone, fewest shots wins
• Reward crates for every win, and a piggy bank that fills with every match

CLIMB THE WEEKLY LEAGUES
Play online to join a league of players at your level. Win the most pots by Sunday to move up,
from Bronze to Diamond, and earn a crate.

PROPER 8-BALL RULES
Groups, fouls, ball in hand and break choices are all here, so a smart safety matters as much
as a long pot.

SEE IT AGAIN
Slow-motion instant replay shows exactly how your best shot went in.

SIMPLE CONTROLS, DEEP GAME
Drag to aim, set spin with a touch, pull back for power. Easy to pick up, hard to master.

FAIR BY DESIGN
Every online shot is refereed by the server, so nobody can cheat their way to a win. Reward
videos are always your choice, and nothing interrupts a rack.

Chalk your cue, pick a city and break.

Optional in-app purchases. Optional reward videos. Coins and rubies are virtual items with no
cash value.
```

**Review notes (paste into both consoles):**

```
1. No account is needed: tap "I am 18 or older", then "Play as guest". Everything can be
   reviewed as a guest.
2. Online matches pair two players waiting at the same venue. When nobody arrives within about
   ten seconds, the player is seated against a computer-controlled opponent from a roster of
   named player profiles, on the same server under the same rules; the Terms of Service state
   this ("Online opponents"). The separate Vs Computer mode is labelled HOUSE in the game.
3. Purchases: coin packs, ruby packs, a one-time starter pack, the season pass (premium track)
   and breaking the piggy bank, which pays the exact coin amount shown in the shop. Crates are
   earned by winning; rubies or a rewarded video only shorten the timer, and a crate's contents
   are fixed when it is earned.
4. The Lucky Shot (Daily rewards → Lucky Shot) is a skill shot: the prize depends only on where
   the cue ball stops, as our server replays the shot. Nothing is drawn at random. The prize
   wheel is free (one spin a day, more for an optional video). Odds and rules for every reward:
   https://cuemaster-api.onrender.com/legal/odds
5. No real-money prizes, no cash-out, no crypto. Coins and rubies have no value outside the game.
6. Account deletion: Profile → Delete account, or
   https://cuemaster-api.onrender.com/legal/delete-account
```

## Privacy answers

**CueMaster's own data:** display name; player ID; game progress and match records; reports a
player writes about another; purchase records (the store's transaction id; no card details ever
reach us). All of it is collected, linked to the player, used for app functionality, never sold
and never used for tracking. Encrypted in transit: yes. Players can delete it: in the app
(Profile → Delete account) and at the delete-account link.

**The Google Mobile Ads SDK** (rewarded video) collects its own data and shares it with Google
for advertising, analytics and fraud prevention, even with non-personalised ads. Declare what
Google lists on its own pages:

- Google Play: https://developers.google.com/admob/android/privacy/play-data-disclosure
- App Store: https://developers.google.com/admob/ios/privacy/data-disclosure

**Apple App Privacy form**, matching the app's privacy manifest: Name, User ID, Purchase History,
Gameplay Content, Other User Content, Payment Info and Other Data, each linked to the user and
used for App Functionality; Advertising Data, not linked, for Third-Party Advertising; plus the
SDK's types from Google's iOS page. Nothing is used for tracking.

## Sources checked 2026-11-09

- Apple age ratings: https://developer.apple.com/news/?id=ks775ehf
- Play testing for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Play target API level (API 36 for new apps): https://support.google.com/googleplay/android-developer/answer/11926878
