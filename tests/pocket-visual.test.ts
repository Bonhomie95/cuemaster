import { test } from "node:test";
import assert from "node:assert/strict";
import mesh from "../mobile/assets/models/table-mesh.json";
import { World, ball, H, W } from "../mobile/src/physics/engine";
function hasCloth(x: number, z: number) {
  const p = mesh.cloth.positions;
  for (let i=0;i<p.length;i+=9) {
    if ([p[i+1],p[i+4],p[i+7]].some(y=>Math.abs(y)>1e-6)) continue;
    const ax=p[i], az=p[i+2], bx=p[i+3], bz=p[i+5], cx=p[i+6], cz=p[i+8];
    const cross=(u:number,v:number,a:number,b:number)=>u*b-v*a;
    const d=cross(bx-ax,bz-az,cx-ax,cz-az);
    if (Math.abs(d)<1e-10) continue;
    const u=cross(x-ax,z-az,cx-ax,cz-az)/d;
    const v=cross(bx-ax,bz-az,x-ax,z-az)/d;
    if(u>=-1e-7 && v>=-1e-7 && u+v<=1+1e-7) return true;
  }
  return false;
}
test("all six visible pocket shelves end at the physics drop boundary",()=>{
  const samples: [number,number,boolean][]=[];
  for(const sign of [-1,1]) {
    samples.push([0,sign*(W+.02),false],[0,sign*(W+.04),true]);
    for(const sx of [-1,1]) samples.push([sx*(H-.03),sign*(W-.03),false],[sx*(H-.01),sign*(W-.01),true]);
  }
  for(const [x,z,dropped] of samples) {
    const b=ball(1,x,z); const w=new World(); w.capture(b);
    assert.equal(b.pocketed,dropped,`physics at ${x},${z}`);
    assert.equal(hasCloth(x,z),!dropped,`visible shelf at ${x},${z}`);
  }
});
