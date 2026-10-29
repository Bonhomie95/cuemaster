import type { Express } from "express";

/**
 * Invite links. A chat app only makes https links tappable, so a friend's table code is shared
 * as https://<api>/join/CODE. The page hands the phone to the installed app (an Android intent
 * that falls back to the Play listing, or the cuemaster:// scheme on iOS) and shows the store
 * buttons and the code itself for everyone else. No script runs: the helmet CSP stays strict.
 */
const PACKAGE = "com.bonhomie.cuemaster";
const playUrl = (code?: string) =>
  `https://play.google.com/store/apps/details?id=${PACKAGE}${
    code
      ? `&referrer=${encodeURIComponent(`utm_source=invite&utm_content=${code}`)}`
      : ""
  }`;
const STYLE = `:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% 0,#14385a,#070f18 70%);color:#dce7f2;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:26rem;padding:2rem 1.25rem;text-align:center}
.brand{letter-spacing:.3em;font-weight:900;color:#fff}.brand b{color:#ffd05b}
h1{color:#fff;font-size:1.6rem;margin:1.2rem 0 .4rem}
.code{display:inline-flex;gap:.35rem;margin:1rem 0}
.code span{width:2.4rem;height:3rem;display:grid;place-items:center;border-radius:.6rem;background:#0d2536;border:1px solid #ffffff26;color:#ffd05b;font-size:1.6rem;font-weight:900}
a.button{display:block;margin:.7rem 0;padding:.95rem;border-radius:.8rem;font-weight:800;text-decoration:none}
.open{background:#ffd05b;color:#10233a}.store{border:1px solid #ffffff33;color:#fff}
p.small{color:#8aa4ba;font-size:.85rem}`;
const escape = (v: string) =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function installLinks(app: Express) {
  const page = (body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CueMaster</title><style>${STYLE}</style></head><body><main><div class="brand">CUE<b>MASTER</b></div>${body}</main></body></html>`;
  const stores = (code?: string) =>
    `<a class="button store" href="${escape(playUrl(code))}">Get it on Google Play</a>${
      process.env.APP_STORE_URL
        ? `<a class="button store" href="${escape(process.env.APP_STORE_URL)}">Download on the App Store</a>`
        : ""
    }`;
  app.get("/join/:code", (req, res) => {
    const code = String(req.params.code).toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(code)) return res.redirect(302, "/play");
    const android = /android/i.test(req.get("user-agent") || "");
    const open = android
      ? `intent://join/${code}#Intent;scheme=cuemaster;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(playUrl(code))};end`
      : `cuemaster://join/${code}`;
    res.type("html").send(
      page(`<h1>You're invited to a table</h1>
<p>Your friend opened a private table. Join with this code:</p>
<div class="code">${code
        .split("")
        .map((c) => `<span>${c}</span>`)
        .join("")}</div>
<a class="button open" href="${escape(open)}">Open CueMaster</a>
${stores(code)}
<p class="small">New to CueMaster? Install it, tap Play pool → Friend → Join with code, and enter ${code}. Codes expire after 15 minutes.</p>`),
    );
  });
  app.get("/play", (_req, res) =>
    res.type("html").send(
      page(`<h1>Real physics. Real rivals.</h1>
<p>Pool in Lagos, London, Paris, Tokyo, Dubai and New York.</p>${stores()}`),
    ),
  );
}
