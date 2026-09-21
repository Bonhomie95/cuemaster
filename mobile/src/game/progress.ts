/** Shared rack ledger. Local matches additionally enforce contact and rail fouls. */
import type { Event } from "../physics/engine";
export type Group = "solids" | "stripes";
export const groupOf = (id: number): Group | null =>
  id >= 1 && id <= 7 ? "solids" : id >= 9 && id <= 15 ? "stripes" : null;
export class Progress {
  turn = 0;
  groups: [Group | null, Group | null] = [null, null];
  returned: number[] = [];
  shotPots: number[] = [];
  scratch = false;
  finished = false;
  strict = false;
  foul = "";
  firstContact: number | null = null;
  railAfterContact = false;
  rails: number[] = [];
  breakChoice: "eight" | "illegal" | "foul" | null = null;
  breakShooter = 0;
  groupClearBeforeShot = false;
  openEightAllowedBeforeShot = false;
  targetWarning(
    id: number,
    isBreak = false,
    rackIds = Array.from({ length: 15 }, (_, i) => i + 1),
  ): string | null {
    if (isBreak) return null;
    const own = this.groups[this.turn];
    const cleared = (g: Group) =>
      rackIds
        .filter((n) => groupOf(n) === g)
        .every((n) => this.returned.includes(n));
    if (!own)
      return id === 8 && !cleared("solids") && !cleared("stripes")
        ? "8 ball is not available yet"
        : null;
    if (cleared(own)) return id === 8 ? null : "Play the 8 ball now";
    return groupOf(id) === own
      ? null
      : id === 8
        ? "Clear your balls before the 8"
        : "Opponent’s ball · wrong first contact";
  }
  begin() {
    this.openEightAllowedBeforeShot =
      !this.groups[this.turn] && !this.targetWarning(8);
    this.shotPots = [];
    this.scratch = false;
    this.foul = "";
    this.firstContact = null;
    this.railAfterContact = false;
    this.rails = [];
    const g = this.groups[this.turn];
    this.groupClearBeforeShot =
      !!g &&
      Array.from({ length: 15 }, (_, i) => i + 1)
        .filter((id) => groupOf(id) === g)
        .every((id) => this.returned.includes(id));
  }
  contact(e: Event) {
    if (
      e.type === "ball" &&
      this.firstContact === null &&
      (e.a === 0 || e.b === 0)
    )
      this.firstContact = e.a === 0 ? e.b! : e.a;
    if (e.type === "rail") {
      if (this.firstContact !== null) this.railAfterContact = true;
      if (e.a !== 0 && !this.rails.includes(e.a)) this.rails.push(e.a);
    }
  }
  pocket(id: number) {
    if (id === 0) {
      this.scratch = true;
      return;
    }
    if (!this.returned.includes(id)) {
      this.returned.push(id);
      this.shotPots.push(id);
    }
  }
  finish(isBreak: boolean) {
    this.foul = this.scratch ? "Cue-ball scratch" : "";
    if (this.strict && this.firstContact === null)
      this.foul = "No object-ball contact";
    if (isBreak) {
      this.breakShooter = this.turn;
      if (this.shotPots.includes(8)) {
        this.breakChoice = "eight";
        if (this.foul) this.turn = 1 - this.turn;
        return;
      }
      if (this.strict && !this.shotPots.length && this.rails.length < 4) {
        this.breakChoice = "illegal";
        this.turn = 1 - this.turn;
        return;
      }
      if (this.strict && this.foul) {
        this.breakChoice = "foul";
        this.turn = 1 - this.turn;
        return;
      }
      if (this.scratch || !this.shotPots.length) this.turn = 1 - this.turn;
      return;
    }
    if (this.strict && this.firstContact !== null) {
      const own = this.groups[this.turn];
      const correct = own
        ? this.groupClearBeforeShot
          ? this.firstContact === 8
          : groupOf(this.firstContact) === own
        : this.firstContact !== 8 || this.openEightAllowedBeforeShot;
      if (!correct) this.foul = "Wrong ball contacted first";
      if (!this.shotPots.length && !this.railAfterContact)
        this.foul = "No rail after contact";
    }
    // The eight cannot be won by also clearing the last group ball on this stroke.
    if (this.shotPots.includes(8)) {
      this.finished = true;
      return;
    }
    if (!this.foul && !this.groups[this.turn]) {
      const group = this.shotPots.map(groupOf).find(Boolean);
      if (group) {
        this.groups[this.turn] = group;
        this.groups[1 - this.turn] = group === "solids" ? "stripes" : "solids";
      }
    }
    const own = this.groups[this.turn];
    if (
      this.foul ||
      !this.shotPots.some((id) =>
        own ? groupOf(id) === own : groupOf(id) !== null,
      )
    )
      this.turn = 1 - this.turn;
  }
  copy() {
    const p = new Progress();
    Object.assign(p, this);
    p.groups = [...this.groups];
    p.returned = [...this.returned];
    p.shotPots = [...this.shotPots];
    p.rails = [...this.rails];
    return p;
  }
}
