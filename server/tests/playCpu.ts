import { Session, seededRandom } from "../../mobile/src/game/session";
import { planCpuShot, cpuPlacement } from "../../mobile/src/game/cpu";
import { localWinner } from "../../mobile/src/game/localMatch";
import { randomUUID } from "node:crypto";
/**
 * Play a whole CPU match the way a device would: the player is driven by the planner at
 * near-perfect skill, the rival by the match seed. Returns the action record a client sends.
 */
export function playCpuMatch(opponent: any, seed: number) {
  const s = new Session();
  s.cpu = opponent;
  s.matchRules = true;
  s.rng = seededRandom(seed);
  s.now = () => 0;
  s.reset("break");
  const settle = () => {
    let n = 0;
    while ((s.running || s.cpuTurn) && n++ < 20000) s.update(0.1);
  };
  s.angle = 0.007;
  s.power = 0.9;
  s.shoot();
  settle();
  for (let turn = 0; turn < 80 && !s.progress.finished; turn++) {
    if (s.progress.breakChoice) s.resolveBreak("accept");
    if (s.placement) {
      const pos = cpuPlacement(s.world.balls, s.headStringPlacement);
      if (!pos || !s.placeCue(pos.x, pos.z)) break;
    }
    const shot = planCpuShot(s.world.balls, s.progress, 0.98, false, () => 0.5);
    Object.assign(s, shot);
    s.shoot();
    settle();
  }
  return {
    actions: s.actions,
    finished: s.progress.finished,
    winner: localWinner(s.progress),
  };
}
type Call = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<{ status: number; body: any }>;
/** Play CPU racks at the Lagos table until the referee verifies a win; returns that finish. */
export async function winVerifiedRack(call: Call) {
  for (let i = 0; i < 6; i++) {
    const started = await call("/local-matches/start", "POST", {
      venueId: "heritage",
      requestId: randomUUID(),
      mode: "cpu",
    });
    if (started.status !== 201) break;
    const played = playCpuMatch(
      started.body.match.opponent,
      started.body.match.seed,
    );
    const finished = await call(
      `/local-matches/${started.body.match.id}/finish`,
      "POST",
      {
        outcome: played.winner === 0 ? "won" : "lost",
        actions: played.actions,
      },
    );
    if (finished.body?.verified) return finished;
  }
  throw new Error("the planner could not beat the rival in six racks");
}
