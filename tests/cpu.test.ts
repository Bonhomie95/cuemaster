import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuSkill, makeCpu, planCpuShot, cpuPlacement } from "../mobile/src/game/cpu";
import { Session } from "../mobile/src/game/session";
import { ball, World, H, R, W } from "../mobile/src/physics/engine";
import { Progress } from "../mobile/src/game/progress";

test("CPU difficulty eases for losses and rises for winning streaks with bounded skill",()=>{
 const low=cpuSkill({cpuWins:1,cpuLosses:9,cpuStreak:-4});
 const normal=cpuSkill({});
 const high=cpuSkill({cpuWins:15,cpuLosses:2,cpuStreak:6});
 assert.ok(low<normal && normal<high);
 assert.ok(cpuSkill({cpuWins:10000,cpuStreak:999})<=.92);
 assert.ok(cpuSkill({cpuLosses:10000,cpuStreak:-999})>=.18);
 assert.equal(makeCpu({},12).kind,"cpu");
});
test("CPU aims at its legal ball and can pot a straight shot with unchanged physics",()=>{
 const p=new Progress();p.turn=1;p.groups=["stripes","solids"];
 const balls=[ball(0,0,.36),ball(1,0,.05),ball(9,.7,.15),ball(8,-.7,-.2)];
 const shot=planCpuShot(balls,p,.92,false,()=>.5);
 const w=new World(balls);const events: any[]=[];
 w.strike(shot.angle,shot.power,shot.side,shot.top);
 for(let i=0;i<12000 && w.active;i++){w.tick();events.push(...w.events);w.events=[];}
 assert.ok(events.some(e=>e.type==="pocket"&&e.a===1));
 assert.ok(!w.balls.find(b=>b.id===0)!.pocketed);
});
test("CPU placement respects occupied balls, rails and the break line",()=>{
 const balls=[ball(0,0,0),ball(1,-H/2,0)];
 const pos=cpuPlacement(balls,true)!;
 assert.ok(pos && pos.x<=-H/2 && Math.abs(pos.z)<W-R);
 assert.ok(new World(balls).placeCue(pos.x,pos.z));
});
test("CPU waits its turn, resolves break choice, places cue and shoots once",()=>{
 const s=new Session();s.matchRules=true;s.cpu=makeCpu({},1);s.reset("break");
 for(let i=0;i<150;i++)s.updateCpu(1/60);
 assert.equal(s.shots,0);
 s.progress.turn=1;s.progress.breakChoice="illegal";s.resetTurnClock();
 for(let i=0;i<400 && !s.running;i++)s.updateCpu(1/60);
 assert.equal(s.progress.breakChoice,null);assert.equal(s.placement,false);
 assert.equal(s.running,true);assert.equal(s.shots,1);
 for(let i=0;i<150;i++)s.updateCpu(1/60);
 assert.equal(s.shots,1);
});
test("CPU never acts after finish or when disabled",()=>{
 const s=new Session();s.cpu=makeCpu({},1);s.reset("break");s.progress.turn=1;s.progress.finished=true;
 for(let i=0;i<200;i++)s.updateCpu(1/60);
 assert.equal(s.shots,0);
 s.progress.finished=false;s.cpu=null;
 for(let i=0;i<200;i++)s.updateCpu(1/60);
 assert.equal(s.shots,0);
});
