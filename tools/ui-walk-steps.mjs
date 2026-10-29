// The screens and buttons the UI walk exercises, in the order a new player meets them.
// `a` and `b` are two players on two origins; every `check` is one line in the report.
export const walkSteps = [
  async ({ a, check, enter, snap }) => {
    await check("guest entry and the name step", async () => {
      await enter(a);
      await snap(a, "00-welcome-name");
      await a.type("Player name", "LagosAce");
      await a.tap("Save and play");
      await a.see("Play Online");
    });
    await check("home", async () => {
      await a.see("Vs Computer");
      await snap(a, "01-home");
    });
    await check("the More menu reaches every other page", async () => {
      for (const [tile, heading] of [
        ["Tables", "Your table collection"],
        ["Practice", "The practice lab"],
        ["Tournaments", "The competition room"],
        ["How to play", "8-ball in a minute"],
        ["Settings", "Sound & play"],
        ["Invite friends", "You both get"],
        ["Leaderboard", "Trophies come from online wins"],
      ]) {
        await a.tap("More");
        await a.tap(tile);
        await a.see(heading);
        await snap(a, "02-" + tile.toLowerCase().replaceAll(" ", "-"));
      }
      await a.tap("Home");
      await a.see("Play Online");
    });
    await check("profile", async () => {
      await a.tap("Open profile");
      await a.see("Player profile");
      await snap(a, "04-profile");
      await a.tap("Home");
    });
    await check("crates page", async () => {
      await a.tap("Crates");
      await a.see("Rewards");
      await a.tap("Home");
    });
  },
  async ({ a, check, snap, sleep }) => {
    await check("daily streak: claim day 1 once", async () => {
      await a.tap("Daily rewards");
      await a.see("Day 1");
      await snap(a, "12-daily");
      await a.tap("Claim");
      await a.until(
        "[...document.querySelectorAll('[aria-label]')].some(e => /^Day 1: .*collected/.test(e.getAttribute('aria-label')))",
      );
    });
    await check("free coins: collect, then a countdown", async () => {
      await a.tap("Collect the free gift");
      await a.until(
        "[...document.querySelectorAll('[aria-label]')].some(e => e.getAttribute('aria-label').startsWith('Next free gift in'))",
      );
    });
    await check("prize wheel lands and pays", async () => {
      await a.tap("Spin");
      await a.tap("Spin the wheel");
      await sleep(1500);
      await snap(a, "13-wheel");
      await a.see("You won", 12000);
    });
    await check("missions and the pass", async () => {
      await a.tap("Missions");
      await a.see(/Finish all three|Claim bonus/);
      await snap(a, "14-missions");
      await a.tap("Pass");
      await a.see("Unlock premium");
      await snap(a, "15-pass");
      await a.tap("Unlock premium");
      await a.see("Top up");
    });
    await check("shop tabs", async () => {
      await a.tap("Rubies");
      await a.see("Handful of rubies");
      await snap(a, "16-shop-rubies");
      await a.tap("Coins");
      await a.see("Pile of coins");
      await a.tap("Offers");
      await a.see("Starter pack");
      await snap(a, "17-shop-offers");
      await a.tap("Close shop");
      await a.see("Play Online");
    });
    await check("free play: aim, shoot, settle, leave", async () => {
      await a.tap("Free Play");
      await a.see("POWER");
      await sleep(2500);
      await a.eval("__cm.angle = 0.004; __cm.power = 1; __cm.shoot()");
      await sleep(900);
      await snap(a, "05-break");
      await a.until("!__cm.running");
      await a.tap("Table settings");
      await a.tap("Quit match");
      await a.tap("Quit");
      await a.see("Play Online");
    });
    await check("vs computer: VS card, then forfeit", async () => {
      await a.tap("Vs Computer");
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
      await b.see("Play Online");
    });
    await check("online: both queue at Lagos and meet", async () => {
      await a.tap("Play a player online");
      await a.tap("Enter Lagos");
      await a.see("FINDING AN OPPONENT");
      await snap(a, "07-searching");
      await b.tap("Play Online");
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
      await b.tap("Join room");
      await a.see("FRIENDLY");
      await sleep(3600);
      await a.tap("Table settings");
      await a.tap("Quit match");
      await a.tap("Resign");
      await b.see("VICTORY");
      await b.tap("Leave table");
    });
    await check(
      "online: alone at the venue, an opponent still arrives",
      async () => {
        await a.see("Choose your venue");
        await a.tap("Play a player online");
        await a.tap("Enter Lagos");
        await a.see("FINDING AN OPPONENT");
        await a.see("WINNER TAKES", 14000);
        await snap(a, "18-vs-regular");
        await sleep(3600);
        // Break if it is ours, then wait for the regular's own shot to arrive and play out.
        const mine = await a.eval("!__cm.cpuTurn");
        if (mine)
          await a.eval("__cm.angle = 0.004; __cm.power = 1; __cm.shoot()");
        await a.until("!__cm.running && __cm.localSeq >= 1", 30000);
        if (await a.eval("__cm.cpuTurn"))
          await a.until(
            `!__cm.running && __cm.localSeq >= ${mine ? 2 : 1}`,
            30000,
          );
        await snap(a, "19-regular-shot");
        // Resigning from the menu leaves the table at once; the loss is settled on the server.
        await a.tap("Table settings");
        await a.tap("Quit match");
        await a.tap("Resign");
        await a.see("Choose your venue");
      },
    );
  },
];
