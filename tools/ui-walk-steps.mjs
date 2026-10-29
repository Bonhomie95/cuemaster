// The screens and buttons the UI walk exercises, in the order a new player meets them.
// `a` and `b` are two players on two origins; every `check` is one line in the report.
export const walkSteps = [
  async ({ a, check, enter, snap }) => {
    await check("guest entry and the name step", async () => {
      await enter(a);
      await snap(a, "00-welcome-name");
      await a.type("Player name", "LagosAce");
      await a.tap("Save and play");
      await a.see("Play pool");
    });
    await check("home", async () => {
      await a.see("THE NEXT SHOT IS YOURS");
      await snap(a, "01-home");
    });
    await check("top navigation", async () => {
      await a.tap("Tables");
      await a.see("Your table collection");
      await snap(a, "02-tables");
      await a.tap("Practice");
      await a.see("The practice lab");
      await snap(a, "03-practice");
      await a.tap("Events");
      await a.see("The competition room");
      await a.tap("Home");
      await a.see("THE NEXT SHOT IS YOURS");
    });
    await check("profile, invite card, leaderboard", async () => {
      await a.tap("Open profile");
      await a.see("Player profile");
      await a.see("Invite friends");
      await snap(a, "04-profile");
      await a.tap("Leaderboard");
      await a.see(/Leaderboard|LEADERBOARD/);
      await a.tap("Home");
    });
    await check("crates page", async () => {
      await a.tap("Crates");
      await a.see("Rewards");
      await a.tap("Home");
    });
  },
  async ({ a, check, snap, sleep }) => {
    await check("free play: aim, shoot, settle, leave", async () => {
      await a.tap("Free play");
      await a.see("POWER");
      await sleep(2500);
      await a.eval("__cm.angle = 0.004; __cm.power = 1; __cm.shoot()");
      await sleep(900);
      await snap(a, "05-break");
      await a.until("!__cm.running");
      await a.tap("Table settings");
      await a.tap("Quit match");
      await a.tap("Quit");
      await a.see("THE NEXT SHOT IS YOURS");
    });
    await check("house rival: VS card, then forfeit", async () => {
      await a.tap("Play pool");
      await a.tap("Play a computer rival");
      await a.tap("Enter Lagos");
      await a.see("House rival");
      await snap(a, "06-vs-house");
      await sleep(2600);
      await a.tap("Table settings");
      await a.tap("Quit match");
      await a.tap("Quit");
      await a.see("Choose your venue");
    });
  },
  async ({ a, b, check, enter, snap, sleep }) => {
    await check("second player joins", async () => {
      await enter(b);
      await b.tap("Skip for now");
      await b.see("Play pool");
    });
    await check("online: both queue at Lagos and meet", async () => {
      await a.tap("Play a player online");
      await a.tap("Enter Lagos");
      await a.see("FINDING AN OPPONENT");
      await snap(a, "07-searching");
      await b.tap("Play pool");
      await b.tap("Enter Lagos");
      await a.see("WINNER TAKES");
      await snap(a, "08-vs-online");
    });
    await check("online: the break plays on both phones", async () => {
      await sleep(3600);
      const breaker = (await a.eval("__cm.cpuTurn")) ? b : a;
      await breaker.eval("__cm.angle = 0.004; __cm.power = 1; __cm.shoot()");
      await sleep(1200);
      await snap(a, "09-online-break");
      for (const p of [a, b])
        await p.until("!__cm.running && __cm.localSeq >= 1");
      const [ta, tb] = await Promise.all(
        [a, b].map((p) =>
          p.eval(
            "JSON.stringify(__cm.world.balls.map(b => [b.id, b.pocketed, b.x.toFixed(4), b.z.toFixed(4)]))",
          ),
        ),
      );
      if (ta !== tb) throw Error("the two phones disagree about the table");
    });
    await check("online: resign, result card, rematch offer", async () => {
      await b.tap("Table settings");
      await b.tap("Quit match");
      await b.tap("Resign");
      await a.see("VICTORY");
      await snap(a, "10-victory");
      await a.tap("Leave table");
      await a.see("Choose your venue");
    });
    await check("friend table by code", async () => {
      await a.tap("Play a friend with a room code");
      await a.tap("Enter Lagos");
      await a.see("Room code");
      await a.see(/Waiting for your friend/);
      const code = await a.eval(
        "document.querySelector('[aria-label^=\"Room code \"]').getAttribute('aria-label').slice(10)",
      );
      await snap(a, "11-friend-room");
      await b.see("Choose your venue");
      await b.tap("Play a friend with a room code");
      await b.tap("Join a friend's table with a code");
      await b.type("Room code", code);
      await b.tap("Join table");
      await a.see("FRIENDLY");
      await sleep(3600);
      await a.tap("Table settings");
      await a.tap("Quit match");
      await a.tap("Resign");
      await b.see("VICTORY");
      await b.tap("Leave table");
    });
  },
];
