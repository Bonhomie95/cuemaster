import { Session, seededRandom } from "../../mobile/src/game/session";
import { planCpuShot, cpuPlacement } from "../../mobile/src/game/cpu";
import { localWinner } from "../../mobile/src/game/localMatch";
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
