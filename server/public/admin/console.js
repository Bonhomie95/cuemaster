"use strict";
let token = "",
  editing = null,
  rows = [];
const $ = (id) => document.getElementById(id);
const message = (text) => {
  $("message").textContent = text;
};
function node(tag, text) {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
}
function button(text, action) {
  const n = node("button", text);
  n.type = "button";
  n.onclick = () => run(action, n);
  return n;
}
async function call(path, method = "GET", body) {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch("/admin" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data =
      r.status === 204
        ? null
        : await r
            .json()
            .catch(() => ({
              error:
                "Request could not be completed. Please try again shortly.",
            }));
    if (!r.ok) {
      if (r.status === 401 && path != "/auth/login") signedOut();
      throw Error(data?.error || "Request failed");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
async function run(action, control) {
  if (control) control.disabled = true;
  message("");
  try {
    await action();
  } catch (e) {
    message(
      e.name === "AbortError"
        ? "Request timed out. Refresh before retrying."
        : e.message,
    );
  } finally {
    if (control) control.disabled = false;
  }
}
function signedOut() {
  token = "";
  $("dashboard").hidden = true;
  $("password").hidden = true;
  $("login").hidden = false;
  $("logout").hidden = true;
}
$("login-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const form = e.target,
      data = Object.fromEntries(new FormData(form));
    const r = await call("/auth/login", "POST", data);
    token = r.token;
    form.reset();
    $("login").hidden = true;
    $("logout").hidden = false;
    if (r.admin.mustChangePassword) {
      $("password").hidden = false;
      return;
    }
    $("dashboard").hidden = false;
    await dashboard();
  }, e.submitter);
};
$("password-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    await call(
      "/auth/password",
      "POST",
      Object.fromEntries(new FormData(e.target)),
    );
    e.target.reset();
    signedOut();
    message("Password changed. Sign in with your new password.");
  }, e.submitter);
};
$("logout").onclick = () =>
  run(async () => {
    try {
      await call("/auth/logout", "POST");
    } finally {
      signedOut();
    }
  });
async function dashboard() {
  const d = await call("/overview");
  $("overview").replaceChildren(
    ...[
      `${d.players} players`,
      `${d.tournaments} tournaments`,
      `${d.openReports} open reports`,
    ].map((t) => node("article", t)),
  );
  await loadEvents();
}
for (const b of document.querySelectorAll("[data-page]"))
  b.onclick = () =>
    run(async () => {
      const page = b.dataset.page;
      for (const id of ["tournaments", "players", "reports", "staff"])
        $(id).hidden = id !== page;
      if (page === "tournaments") await loadEvents();
      if (page === "reports") await loadReports();
      if (page === "staff") await loadStaff();
    });
function edit(event) {
  editing = event || null;
  const f = $("event-form");
  f.reset();
  $("event-title").textContent = event ? "Edit draft" : "New draft";
  if (event)
    for (const [key, value] of Object.entries(event)) {
      const field = f.elements.namedItem(key);
      if (!field) continue;
      field.value =
        key === "rules"
          ? value.join("\n")
          : key === "placements"
            ? (value || []).map((p) => `${p.position}:${p.amount}`).join("\n")
            : key === "countries"
              ? (value || []).join(",")
              : ["startsAt", "endsAt"].includes(key)
                ? new Date(
                    new Date(value) -
                      new Date(value).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : String(value);
    }
  f.hidden = false;
  f.scrollIntoView({ behavior: "smooth" });
}
$("new-event").onclick = () => edit(null);
$("cancel-edit").onclick = () => {
  $("event-form").hidden = true;
  editing = null;
};
async function loadEvents() {
  rows = await call("/tournaments");
  $("event-list").replaceChildren(
    ...rows.map((event) => {
      const card = node("article", "");
      card.append(
        node("h3", event.name),
        node(
          "p",
          `${event.status.toUpperCase()} · ${event.currency} · level ${event.level} · ${event.entry} coin entry`,
        ),
        node("p", event.prize),
      );
      const actions = node("div", "");
      actions.className = "actions";
      if (event.status === "draft")
        actions.append(button("Edit draft", () => edit(event)));
      for (const status of event.status === "closed"
        ? []
        : event.status === "open"
          ? ["closed"]
          : ["announced", "open", "closed"])
        actions.append(
          button(
            status === "open"
              ? "Open registration"
              : status === "announced"
                ? "Announce"
                : "Close event",
            async () => {
              if (!confirm(`Set ${event.name} to ${status}?`)) return;
              await call(`/tournaments/${event.id}/status`, "POST", {
                status,
                version: event.version,
              });
              await loadEvents();
            },
          ),
        );
      actions.append(
        button("Audit history", async () => {
          const history = await call(`/tournaments/${event.id}/audit`);
          message(
            history
              .map((h) => `${h.at} · ${h.action} · ${h.actor}`)
              .join("\n") || "No changes recorded.",
          );
        }),
      );
      card.append(actions);
      return card;
    }),
  );
}
$("event-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const d = Object.fromEntries(new FormData(e.target));
    const data = {
      ...d,
      level: Number(d.level),
      entry: Number(d.entry),
      reward: Number(d.reward),
      rules: d.rules
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      placements: d.placements
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => {
          const [position, amount] = s.split(":").map(Number);
          return { position, amount };
        }),
      countries: d.countries
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      startsAt: new Date(d.startsAt).toISOString(),
      endsAt: new Date(d.endsAt).toISOString(),
    };
    if (editing)
      await call("/tournaments/" + editing.id, "PATCH", {
        version: editing.version,
        data,
      });
    else await call("/tournaments", "POST", data);
    $("event-form").hidden = true;
    editing = null;
    await dashboard();
    message("Draft saved.");
  }, e.submitter);
};
$("player-search").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const q = new FormData(e.target).get("q");
    const players = await call("/players?q=" + encodeURIComponent(q));
    $("player-list").replaceChildren(
      ...players.map((p) => {
        const n = node("article", "");
        n.append(
          node("h3", p.name),
          node(
            "p",
            `${p.id} · ${p.xp} XP · ${p.coins} coins · ${p.suspended ? "Suspended" : "Active"}`,
          ),
          button(
            p.suspended ? "Restore account" : "Suspend account",
            async () => {
              const reason = prompt("Reason (at least 5 characters)");
              if (!reason) return;
              await call("/players/" + p.id, "PATCH", {
                suspended: !p.suspended,
                reason,
              });
              message("Player updated. Search again to refresh.");
            },
          ),
          button("Change reported name", async () => {
            const name = prompt("Replacement name");
            if (!name) return;
            const reason = prompt("Moderation reason");
            if (!reason) return;
            await call("/players/" + p.id, "PATCH", { name, reason });
            message("Name updated.");
          }),
        );
        return n;
      }),
    );
  }, e.submitter);
};
async function loadReports() {
  const reports = await call("/reports");
  $("report-list").replaceChildren(
    ...reports.map((r) => {
      const n = node("article", "");
      n.append(
        node("h3", r.reason),
        node("p", `Player ${r.playerId} · ${r.details}`),
        button("Resolve report", async () => {
          const note = prompt("Resolution note");
          if (!note) return;
          await call("/reports/" + r._id + "/resolve", "POST", { note });
          await loadReports();
        }),
      );
      return n;
    }),
  );
  if (!reports.length) $("report-list").textContent = "No open reports.";
}
async function loadStaff() {
  const staff = await call("/staff");
  $("staff-list").replaceChildren(
    ...staff.map((a) => {
      const n = node("article", "");
      n.append(
        node("h3", a.name),
        node(
          "p",
          `${a.username} · ${a.role} · ${a.email || "Email not configured"} · ${a.disabled ? "Disabled" : "Active"}`,
        ),
      );
      if (a.role !== "owner")
        n.append(
          button(a.disabled ? "Enable staff" : "Disable staff", async () => {
            const reason = prompt(
              "Reason for access change (at least 5 characters)",
            );
            if (!reason) return;
            await call("/staff/" + a._id, "PATCH", {
              disabled: !a.disabled,
              reason,
            });
            await loadStaff();
          }),
        );
      return n;
    }),
  );
}

$("staff-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const result = await call(
      "/staff",
      "POST",
      Object.fromEntries(new FormData(e.target)),
    );
    e.target.reset();
    await loadStaff();
    message(
      `Temporary password (shown once): ${result.temporaryPassword}\n${result.message}`,
    );
  }, e.submitter);
};
