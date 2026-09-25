import type { Express } from "express";

/**
 * Public policy pages. Both stores require reachable URLs for privacy, terms, support and
 * account deletion, and Google requires the deletion route to work without installing the app.
 * Content comes from docs/release/legal and is rendered from env so the owner publishes by
 * configuring contacts, not by editing markup. Missing configuration shows a draft banner
 * instead of pretending the policy is in force.
 */
const ENTITY = () => process.env.PUBLIC_COMPANY || "Bonhomie LLC";
const SUPPORT = () => process.env.PUBLIC_SUPPORT_EMAIL || "";
const EFFECTIVE = () => process.env.PUBLIC_POLICY_DATE || "";
export const legalConfigured = () => !!SUPPORT() && !!EFFECTIVE();

const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      (
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }) as Record<string, string>
      )[c],
  );

const STYLE = `:root{color-scheme:dark}
body{margin:0;background:#070f18;color:#dce7f2;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:2.5rem 1.25rem 5rem}
h1{font-size:1.9rem;line-height:1.25;color:#fff;margin:.2rem 0 .3rem}
h2{font-size:1.15rem;color:#ffd05b;margin:2.2rem 0 .5rem}
a{color:#7fd0ff}
nav{display:flex;flex-wrap:wrap;gap:1rem;padding:1rem 1.25rem;border-bottom:1px solid #ffffff1f}
nav b{color:#fff;letter-spacing:.18em}
.meta{color:#8aa4ba;font-size:.85rem}
.draft{border:1px solid #ffb02e;background:#3a2a0b;color:#ffd79a;padding:.9rem 1rem;border-radius:.6rem;margin:1rem 0}
ul{padding-left:1.15rem}`;

function page(title: string, body: string) {
  const draft = legalConfigured()
    ? ""
    : `<p class="draft"><b>Draft — not yet in force.</b> ${escape(ENTITY())} must set a working support contact and an effective date before this page is published or referenced in a store listing.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CueMaster · ${escape(title)}</title><style>${STYLE}</style></head><body>
<nav><b>CUEMASTER</b><a href="/legal/privacy">Privacy</a><a href="/legal/terms">Terms</a><a href="/legal/support">Support</a><a href="/legal/delete-account">Delete account</a></nav>
<main><h1>${escape(title)}</h1>
<p class="meta">${escape(ENTITY())}${EFFECTIVE() ? ` · Effective ${escape(EFFECTIVE())}` : ""}${SUPPORT() ? ` · <a href="mailto:${escape(SUPPORT())}">${escape(SUPPORT())}</a>` : ""}</p>
${draft}${body}</main></body></html>`;
}

const contact = () =>
  SUPPORT()
    ? `<a href="mailto:${escape(SUPPORT())}">${escape(SUPPORT())}</a>`
    : "the support address published in the store listing";

const PRIVACY = () => `
<p>CueMaster is operated by ${escape(ENTITY())}. This policy explains what the game uses and how to control it.</p>
<h2>Information we use</h2>
<ul>
<li>A player identifier, your chosen name, avatar and country, your progress, coin balance, cue ownership, challenge results and match records. Names, avatars, countries and ranking statistics appear on leaderboards.</li>
<li>If you connect Google or Apple, the provider's account identifier and the identity details you allow. We never receive your provider password. Apple refresh tokens are stored encrypted so your Apple authorization can be revoked when you delete your account.</li>
<li>If you save a payout wallet, its Base-network address and verification status. The game never asks for a seed phrase or private key and does not process cryptocurrency deposits or payouts.</li>
<li>Player reports and block lists, for moderation.</li>
<li>Your coin and ruby balances, the crates you hold and what they contained, and any ruby purchase you make. A purchase is recorded by the transaction identifier the store gives us; we never see your card or payment details.</li>
<li>Your IP address, seen transiently by the service infrastructure and used for request rate limiting.</li>
</ul>
<h2>Adverts</h2>
<p>You can choose to watch a short video to take an hour off a reward crate. Nothing else in the game shows adverts, and you never have to watch one.</p>
<p>Those videos are served by Google AdMob. We ask AdMob for <b>non-personalised adverts only</b>: we do not read your device's advertising identifier, we do not ask to track you across other apps and websites, and we do not build an advertising profile of you. Google receives the technical information it needs to deliver and count an advert, and confirms back to us that you finished watching so the hour can be applied. Google's own handling of that information is described at <a href="https://policies.google.com/technologies/partner-sites">policies.google.com/technologies/partner-sites</a>.</p>
<p>We do not sell personal information.</p>
<h2>Why we use it</h2>
<p>Authentication, saved progress, server-verified challenge rewards, leaderboards, account security and moderation. Hosting, database and authentication providers process only what those services require.</p>
<h2>Children</h2>
<p>CueMaster is not directed to children. Players confirm they are 18 or older before entering. If we learn that an account belongs to a child, we delete it.</p>
<h2>Your controls</h2>
<ul>
<li>Change your name, avatar and country in <b>Profile</b>.</li>
<li>Remove a saved wallet address in <b>Profile → USDC rewards</b>.</li>
<li>Manage your block list in <b>Profile → Blocked players</b>.</li>
<li>Delete your account in <b>Profile → Delete account</b>, or use the <a href="/legal/delete-account">web deletion request</a>.</li>
</ul>
<p>Deletion removes your profile, sessions, challenge tickets, event entries, wallet challenges and the reports linked to you, and clears you from other players' block lists. Apple authorization is revoked first; if that fails the app tells you and the account stays so you can retry. Encrypted backups are rotated out within 30 days.</p>
<h2>Prize competitions</h2>
<p>Paid-entry and USDC prize competitions are not active. If they are introduced, a separate notice will describe any identity, age, residence or tax information required before it is collected.</p>
<h2>Contact</h2>
<p>Questions, privacy requests and complaints: ${contact()}.</p>`;

const TERMS = () => `
<p>CueMaster is provided by ${escape(ENTITY())}. By playing you accept these terms.</p>
<h2>The game</h2>
<p>CueMaster offers virtual pool, practice challenges, local pass-and-play and computer opponents whose difficulty adapts to your recent results. The current build does not provide live online human matchmaking.</p>
<h2>Your account</h2>
<p>You must be 18 or older. Do not use another person's identity, exploit the software, manipulate challenge submissions, harass players or choose offensive names. Reports may lead to a name change or suspension after moderation.</p>
<p>Guest progress depends on credentials held on your device. Connecting Google or Apple preserves access. Signing in to a previously registered account loads that account's progress; balances are not combined.</p>
<h2>Coins, rubies and crates</h2>
<p>Coins and rubies are virtual items. They are not cryptocurrency, not a deposit, and not a promise of cash redemption. They have no value outside the game, cannot be transferred between players and cannot be exchanged for money. Entry to any game or competition is paid in coins only.</p>
<p>Winning a match seals a reward crate. A crate opens after its timer, or immediately if you spend rubies. Crate contents are random within a range that depends on the crate's type, and are decided by our service when the crate is opened, never by your device. Rubies change when a crate opens; they never change what is inside it.</p>
<p>A crate's timer can also be shortened by watching a short advert. That is always optional.</p>
<p>Where ruby purchases are offered they are sold through Apple or Google, at the price their store shows, and are delivered as rubies only. Rubies buy time on a crate; they never buy coins, cues or tables. Purchases are final except where the store's own refund rules or your local law say otherwise; refunds are handled by Apple or Google, not by us. We may change prices, pack sizes and crate contents, and will publish the current odds in the game.</p>
<p>Challenge awards are validated by our service; interrupted, invalid or duplicate submissions may earn nothing.</p>
<h2>Competitions</h2>
<p>Competitions charge their entry in coins and pay their prizes in coins. Prizes are credited automatically when the event closes, using the verified scores shown on the event board. An entry fee is not refunded if you do not finish.</p>
<p>USDC payouts and real-currency prize competitions are not active. Saving a Base wallet address does not create any entitlement. USDC on TRON/TRC20 is not supported. Before any prize competition opens we will publish its eligibility, funding, rewarded positions, verification, disputes, cancellation, tax handling and payout deadlines. Apple and Google neither sponsor nor administer CueMaster competitions.</p>
<h2>Ending use</h2>
<p>You can delete your account at any time in Profile. We may suspend accounts that breach these terms. ${escape(ENTITY())} may change the game or these terms; material changes will be notified in the app.</p>
<h2>Contact</h2>
<p>${contact()}</p>`;

const SUPPORT_PAGE = () => `
<p>We answer support mail within five business days.</p>
<h2>Contact</h2>
<p>${contact()}</p>
<h2>Before you write</h2>
<ul>
<li><b>Lost progress after signing out as a guest.</b> Guest accounts live on one device. Connect Google or Apple in Profile to keep progress.</li>
<li><b>A challenge reward did not arrive.</b> Rewards are verified on our server and granted once per challenge. Reopen the app while online and the balance refreshes.</li>
<li><b>Reporting a player.</b> Profile → Leaderboard → Options for that player.</li>
<li><b>Deleting your account.</b> Profile → Delete account, or the <a href="/legal/delete-account">web request form</a>.</li>
</ul>
<h2>What to include</h2>
<p>Your in-game name, your player ID from Profile, the device and the approximate time the problem happened.</p>`;

const DELETE_PAGE = () => `
<h2>In the app (fastest)</h2>
<p>Open <b>Profile</b>, scroll to <b>Delete account</b>, type DELETE and confirm. Deletion is immediate and cannot be undone.</p>
<h2>Without the app</h2>
<p>Email ${contact()} from the address connected to your Google or Apple sign-in, with the subject <b>Delete my CueMaster account</b>. Include your in-game name and, if you have it, your player ID. We verify ownership before deleting and confirm within 30 days.</p>
<h2>What is deleted</h2>
<ul>
<li>Your profile, name, avatar, country, level, XP and coin balance.</li>
<li>Sessions, challenge tickets, event entries and wallet verification challenges.</li>
<li>Any saved payout wallet address, and the reports you filed or that named you.</li>
<li>Your Apple sign-in authorization is revoked before the account is removed.</li>
</ul>
<h2>What is kept, and for how long</h2>
<p>Encrypted backups are rotated out within 30 days. Aggregate, non-identifying counts (for example the number of challenges completed across all players) are kept. Records we must retain by law are kept only for as long as the law requires.</p>`;

export function installLegal(app: Express) {
  const html = (res: any, body: string) =>
    res.type("html").set("Cache-Control", "public, max-age=300").send(body);
  app.get("/legal/privacy", (_q, res) =>
    html(res, page("Privacy policy", PRIVACY())),
  );
  app.get("/legal/terms", (_q, res) =>
    html(res, page("Terms of service", TERMS())),
  );
  app.get("/legal/support", (_q, res) =>
    html(res, page("Support", SUPPORT_PAGE())),
  );
  app.get("/legal/delete-account", (_q, res) =>
    html(res, page("Delete your account", DELETE_PAGE())),
  );
  app.get("/legal", (_q, res) => res.redirect(302, "/legal/privacy"));
}
