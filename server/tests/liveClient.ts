import assert from "node:assert/strict";
/** Online-play helpers shared by the suites that need real matches over the socket. */
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";

/** A fresh guest's session token. */
export async function guestToken() {
  const r = await fetch(base + "/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).token as string;
}
export async function me(token: string) {
  const r = await fetch(base + "/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.json();
}
/** A socket with an inbox, so a test can wait for the next message of a given type. */
export async function connect(token: string) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/live");
  const inbox: any[] = [];
  const waiting: { type: string; resolve: (m: any) => void }[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    const i = waiting.findIndex((w) => w.type === m.t);
    if (i >= 0) waiting.splice(i, 1)[0].resolve(m);
    else inbox.push(m);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const next = (type: string, ms = 8000) => {
    const i = inbox.findIndex((m) => m.t === type);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`No ${type} message within ${ms} ms`)),
        ms,
      );
      waiting.push({
        type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  };
  const send = (m: any) => ws.send(JSON.stringify(m));
  send({ t: "hello", token });
  await next("welcome");
  return { ws, send, next };
}

/** Two connected players queue at Lagos and meet; resolves with each one's match message. */
export async function meet(
  a: Awaited<ReturnType<typeof connect>>,
  b: Awaited<ReturnType<typeof connect>>,
) {
  a.send({ t: "queue", venueId: "heritage" });
  await a.next("queued");
  b.send({ t: "queue", venueId: "heritage" });
  return Promise.all([a.next("match"), b.next("match")]);
}
