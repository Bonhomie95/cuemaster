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
        : await r.json().catch(() => ({
            error: "Request could not be completed. Please try again shortly.",
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
      for (const id of ["tournaments", "players", "reports", "staff", "audit"])
        $(id).hidden = id !== page;
      if (page === "tournaments") await loadEvents();
      if (page === "reports") await loadReports();
      if (page === "staff") await loadStaff();
      if (page === "audit") await loadAudit();
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
      if (value === null || value === undefined) continue;
      field.value =
        key === "rules"
          ? value.join("\n")
          : key === "placements"
            ? (value || []).map((p) => `${p.position}:${p.amount}`).join("\n")
            : key === "countries"
              ? (value || []).join(",")
              : ["startsAt", "endsAt", "registrationClosesAt"].includes(key)
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
const PHASE_LABEL = {
  draft: "Draft",
  announced: "Announced",
  registration: "Registration open",
  waiting: "Waiting to start",
  play: "In play",
  closed: "Closed",
  cancelled: "Cancelled",
};
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
function formatLabel(event) {
  return event.format === "series"
    ? event.bestOf === 1
      ? "Game of 1 vs club rival"
      : `Best of ${event.bestOf} vs club rival`
    : "Straight-pot score attack";
}
async function loadEvents() {
  rows = await call("/tournaments");
  $("event-list").replaceChildren(
    ...rows.map((event) => {
      const card = node("article", "");
      const phase = node("span", PHASE_LABEL[event.phase] || event.status);
      phase.className = `phase ${event.phase}`;
      const title = node("h3", "");
      title.append(phase, document.createTextNode(event.name));
      const meta = node("div", "");
      meta.className = "meta";
      meta.append(
        node(
          "div",
          `${formatLabel(event)} · ${event.entrants}/${event.maxPlayers} players (min ${event.minPlayers}) · level ${event.level}+`,
        ),
        node(
          "div",
          `${event.entry ? `${event.entry} coin entry` : "Free entry"} · ${event.currency} · ${event.prize}` +
            (event.placements?.length
              ? ` · places: ${event.placements.map((p) => `#${p.position} ${p.amount}`).join(", ")}`
              : ""),
        ),
        node(
          "div",
          `Join by ${when(event.joinDeadline)} · play ${when(event.startsAt)} → ${when(event.endsAt)}`,
        ),
      );
      if (event.payouts)
        meta.append(
          node(
            "div",
            `Settled ${when(event.settledAt)}: ${event.payouts.length ? event.payouts.map((p) => `#${p.position} ${p.coins} coins`).join(", ") : "no prizes owed"}`,
          ),
        );
      if (event.cancelReason)
        meta.append(node("div", `Cancelled: ${event.cancelReason}`));
      card.append(title, meta);
      const actions = node("div", "");
      actions.className = "actions";
      if (event.status === "draft")
        actions.append(button("Edit draft", () => edit(event)));
      const transitions =
        {
          draft: ["announced", "open"],
          announced: ["open", "cancelled"],
          open: ["closed", "cancelled"],
        }[event.status] || [];
      for (const status of transitions)
        actions.append(
          button(
            {
              open: "Open registration",
              announced: "Announce",
              closed: "Close & pay prizes now",
              cancelled: "Cancel & refund",
            }[status],
            async () => {
              const body = { status, version: event.version };
              if (status === "cancelled") {
                const reason = prompt(
                  "Reason players will see for the cancellation (at least 5 characters)",
                );
                if (!reason) return;
                body.reason = reason;
              } else if (!confirm(`Set ${event.name} to ${status}?`)) return;
              const r = await call(
                `/tournaments/${event.id}/status`,
                "POST",
                body,
              );
              await loadEvents();
              if (r.settlement?.paid)
                message(
                  `Closed. Paid ${r.settlement.paid.length} placement(s)${r.settlement.skipped ? ` — ${r.settlement.skipped}` : ""}.`,
                );
              if (r.settlement?.refunded)
                message(
                  `Cancelled. Refunded ${r.settlement.refunded.length} entry fee(s).`,
                );
            },
          ),
        );
      if (event.status === "closed")
        actions.append(
          button("Retry payout", async () => {
            const r = await call(`/tournaments/${event.id}/settle`, "POST");
            message(
              r.paid.length
                ? `Paid ${r.paid.length} outstanding placement(s).`
                : r.skipped || "Every placement was already paid.",
            );
            await loadEvents();
          }),
        );
      actions.append(
        button("Entrants", async () => {
          const list = await call(`/tournaments/${event.id}/entries`);
          const existing = card.querySelector("table.entries");
          if (existing) {
            existing.remove();
            return;
          }
          const table = node("table", "");
          table.className = "entries";
          const head = node("tr", "");
          for (const h of [
            "#",
            "Player",
            event.format === "series" ? "Frames (W–L)" : "Best (shots)",
            "Joined",
            "Fee",
            "State",
          ])
            head.append(node("th", h));
          table.append(head);
          list.forEach((row, i) => {
            const tr = node("tr", "");
            tr.append(
              node("td", String(i + 1)),
              node(
                "td",
                `${row.name}${row.country ? ` (${row.country})` : ""}`,
              ),
              node(
                "td",
                event.format === "series"
                  ? `${row.wins || 0}–${row.losses || 0} of ${row.frames}`
                  : row.shots
                    ? `${row.shots}`
                    : "—",
              ),
              node("td", when(row.joinedAt)),
              node("td", String(row.entry || 0)),
              node(
                "td",
                row.suspended
                  ? "Suspended"
                  : row.activeFrame
                    ? "Frame in progress"
                    : row.done
                      ? "Series complete"
                      : row.score !== undefined
                        ? "Scored"
                        : "Entered",
              ),
            );
            table.append(tr);
          });
          if (!list.length)
            table.append(node("caption", "Nobody has entered yet."));
          card.append(table);
        }),
        button("Audit history", async () => {
          const history = await call(`/tournaments/${event.id}/audit`);
          message(
            history
              .map(
                (h) =>
                  `${h.at} · ${h.action} · ${h.actor}${h.reason ? ` · ${h.reason}` : ""}`,
              )
              .join("\n") || "No changes recorded.",
          );
        }),
      );
      if (event.status !== "open") {
        const remove = button("Delete", async () => {
          if (
            !confirm(
              `Permanently delete "${event.name}"? The deletion is recorded in the audit log.`,
            )
          )
            return;
          const reason = prompt("Reason for deleting (at least 5 characters)");
          if (!reason) return;
          await call(`/tournaments/${event.id}`, "DELETE", {
            version: event.version,
            reason,
          });
          await dashboard();
          message("Tournament deleted.");
        });
        remove.className = "danger";
        actions.append(remove);
      }
      card.append(actions);
      return card;
    }),
  );
}
$("run-lifecycle").onclick = () =>
  run(async () => {
    const r = await call("/tournaments/lifecycle", "POST");
    await loadEvents();
    message(
      r.acted.length
        ? r.acted.map((a) => `${a.action}: ${a.id}`).join("\n")
        : "Nothing due: no event has reached its start or close.",
    );
  }, $("run-lifecycle"));
$("event-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const d = Object.fromEntries(new FormData(e.target));
    const data = {
      ...d,
      level: Number(d.level),
      entry: Number(d.entry),
      reward: Number(d.reward),
      bestOf: Number(d.bestOf),
      maxPlayers: Number(d.maxPlayers),
      minPlayers: Number(d.minPlayers),
      registrationClosesAt: d.registrationClosesAt
        ? new Date(d.registrationClosesAt).toISOString()
        : undefined,
      rules: d.rules
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      placements: d.placements
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => {
          const [position, amount] = s.split(":").map((v) => Number(v.trim()));
          if (!Number.isFinite(position) || !Number.isFinite(amount))
            throw Error(`Rewarded positions: "${s}" is not position:amount.`);
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

async function loadAudit() {
  const rows = await call("/audit");
  $("audit-list").replaceChildren(
    ...rows.map((r) => {
      const n = node("article", "");
      n.append(
        node("h3", `${r.action} · ${r.event?.name || ""}`),
        node(
          "p",
          `${new Date(r.at).toLocaleString()} · ${r.actorName || r.actor}`,
        ),
        node("p", r.reason || ""),
      );
      return n;
    }),
  );
  if (!rows.length) $("audit-list").textContent = "No recorded deletions.";
}
