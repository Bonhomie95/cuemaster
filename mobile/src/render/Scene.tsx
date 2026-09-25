import { cueElevation } from "./cuePose";
import CityInlay from "./CityInlay";
import React, { useMemo, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import meshData from "../../assets/models/table-mesh.json";
import { session, skins } from "../game/session";
import { R, H, W } from "../physics/engine";
import {
  ballTexture,
  grain,
  shadowTexture,
  clothSurface,
  floorTexture,
} from "./textures";
const spinQ = new T.Quaternion();
// Three shaded lamps over the table, as in a real pool hall. Their positions drive both the
// light and the direction each ball's soft shadow falls.
export const lamps = [-0.82, 0, 0.82].map((x) => new T.Vector3(x, 1.05, 0));
/** A dark room whose only bright features are the lamp panels, so balls reflect lamps, not a studio. */
function hallEnvironment() {
  const room = new T.Scene();
  const box = new T.Mesh(
    new T.BoxGeometry(12, 5, 8),
    new T.MeshBasicMaterial({ color: "#16120e", side: T.BackSide }),
  );
  box.position.y = 1.5;
  room.add(box);
  const floor = new T.Mesh(
    new T.PlaneGeometry(3, 1.6),
    new T.MeshBasicMaterial({ color: "#0d3a2a" }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.05;
  room.add(floor);
  for (const l of lamps) {
    const panel = new T.Mesh(
      new T.PlaneGeometry(0.3, 0.19),
      new T.MeshBasicMaterial({ color: new T.Color(26, 24, 21) }),
    );
    panel.rotation.x = Math.PI / 2;
    panel.position.set(l.x, 1.2, l.z);
    room.add(panel);
  }
  const rim = new T.Mesh(
    new T.PlaneGeometry(10, 0.6),
    new T.MeshBasicMaterial({ color: new T.Color(0.5, 0.42, 0.32) }),
  );
  rim.position.set(0, 2.4, -3.9);
  room.add(rim);
  return room;
}
function Lighting() {
  const { gl, scene } = useThree();
  useEffect(() => {
    // Neutral keeps ivory white and ball colours true; ACES greys the cue ball.
    gl.toneMapping = T.NeutralToneMapping;
    gl.toneMappingExposure = 1.15;
  }, [gl]);
  const spots = useMemo(
    () =>
      lamps.map((l) => {
        const spot = new T.SpotLight("#fff2dc", 2.9, 5, 0.8, 1, 2);
        spot.position.copy(l);
        // No shadow maps: the lamps are almost overhead, so a real shadow hides under its own
        // ball from this camera. The ball meshes carry a drawn contact shadow instead.
        // The target must live in the graph or its world matrix never updates.
        spot.target.position.set(0, -l.y, 0);
        spot.add(spot.target);
        return spot;
      }),
    [],
  );
  useEffect(() => {
    const pm = new T.PMREMGenerator(gl);
    const room = hallEnvironment();
    const env = pm.fromScene(room, 0.02, 0.1, 100, { size: 256 });
    scene.environment = env.texture;
    scene.environmentIntensity = 0.55;
    // The same hall stands in for the room behind the table in the aim camera.
    scene.background = env.texture;
    scene.backgroundBlurriness = 0.55;
    scene.backgroundIntensity = 0.32;
    return () => {
      scene.environment = null;
      scene.background = null;
      env.dispose();
      room.traverse((o) => {
        const m = o as T.Mesh;
        m.geometry?.dispose();
        (m.material as T.Material | undefined)?.dispose();
      });
      pm.dispose();
    };
  }, [gl, scene]);
  return (
    <>
      <hemisphereLight args={["#fff1d8", "#0b1712", 0.34]} />
      {/* Lamp spill that reaches the rails and the players' side of the table. */}
      <directionalLight
        position={[0.3, 2, 1.4]}
        intensity={0.35}
        color="#ffe7c4"
      />
      {spots.map((spot, i) => (
        <primitive key={i} object={spot} />
      ))}
    </>
  );
}
function Table() {
  const skin = skins[session.skin];
  const textures = useMemo(
    () => ({
      cloth: clothSurface(),
      weave: grain("cloth"),
      wood: grain("wood"),
    }),
    [],
  );
  const geometries = useMemo(
    () =>
      Object.entries(meshData).map(([name, data]) => {
        const g = new T.BufferGeometry();
        g.setAttribute(
          "position",
          new T.Float32BufferAttribute(data.positions, 3),
        );
        g.setAttribute("normal", new T.Float32BufferAttribute(data.normals, 3));
        const uv = [];
        for (let i = 0; i < data.positions.length; i += 3)
          uv.push(
            data.positions[i] / 2.8 + 0.5,
            data.positions[i + 2] / 1.5 + 0.5,
          );
        g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
        return { name, g };
      }),
    [],
  );
  return (
    <group>
      {geometries.map(({ name, g }) => (
        <mesh key={name} geometry={g}>
          {name === "cloth" || name === "cushion" || name === "leather" ? (
            <meshStandardMaterial
              roughness={0.95}
              envMapIntensity={0.12}
              bumpMap={
                name === "cloth" || name === "cushion" ? textures.weave : null
              }
              bumpScale={0.0009}
              color={
                name === "cloth"
                  ? skin.cloth
                  : name === "cushion"
                    ? skin.cushion
                    : "#394039"
              }
              map={name === "cloth" ? textures.cloth : null}
              side={name === "cushion" ? T.DoubleSide : T.FrontSide}
            />
          ) : (
            <meshStandardMaterial
              color={
                (
                  {
                    cloth: skin.cloth,
                    cushion: skin.cushion,
                    wood: skin.wood,
                    body: "#151c1b",
                    brass: skin.metal,
                    leather: "#070b0a",
                    ivory: "#f4f0e2",
                  } as any
                )[name]
              }
              roughness={
                name === "cloth" || name === "cushion"
                  ? 0.92
                  : name === "wood"
                    ? 0.38
                    : name === "brass"
                      ? 0.4
                      : 0.6
              }
              metalness={name === "brass" ? 0.5 : 0.04}
              map={
                name === "cloth"
                  ? textures.cloth
                  : name === "wood"
                    ? textures.wood
                    : null
              }
              bumpMap={name === "cloth" ? textures.cloth : null}
              bumpScale={0.00005}
              envMapIntensity={
                name === "leather"
                  ? 0.08
                  : name === "cloth"
                    ? 0.25
                    : name === "wood"
                      ? 1.1
                      : 0.65
              }
              side={name === "cushion" ? T.DoubleSide : T.FrontSide}
            />
          )}
        </mesh>
      ))}
      {/* cloth spots, inset rather than an obstructive logo */}
      {[-H / 2, H / 2].map((x) => (
        <mesh key={x} position={[x, 0.0009, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.0028, 0.004, 24]} />
          <meshBasicMaterial color="#a4bbae" transparent opacity={0.45} />
        </mesh>
      ))}
    </group>
  );
}
/** [x, z, mouth radius] in ball radii, so the trim follows the ball size and the rail cut. */
const pocketCenters: [number, number, number][] = [
  [H + 0.35 * R, W + 0.35 * R, 2.35 * R],
  [H + 0.35 * R, -W - 0.35 * R, 2.35 * R],
  [-H - 0.35 * R, W + 0.35 * R, 2.35 * R],
  [-H - 0.35 * R, -W - 0.35 * R, 2.35 * R],
  [0, W + 0.6 * R, 1.95 * R],
  [0, -W - 0.6 * R, 1.95 * R],
];
/**
 * Pocket trim. Overhead, the modelled mouth reads as a muddle of cloth shelf, cushion ends and
 * liner, so each mouth is covered by a black opening that sits above the shelf but below the
 * balls, framed by a metal cap arc on the rail top in the venue's finish.
 */
function Pockets() {
  const skin = skins[session.skin];
  return (
    <group>
      {pocketCenters.map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.004, 0]}
            renderOrder={1}
          >
            <circleGeometry args={[r, 32]} />
            <meshBasicMaterial color="#04060a" toneMapped={false} />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, -Math.atan2(z, x) - Math.PI * 0.58]}
            position={[0, 0.0665, 0]}
          >
            <ringGeometry
              args={[r - 0.008, r + 0.012, 32, 1, 0, Math.PI * 1.12]}
            />
            <meshStandardMaterial
              color={skin.metal}
              metalness={0.4}
              roughness={0.24}
              envMapIntensity={1.3}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
function Balls() {
  const contactShadow = useMemo(() => shadowTexture(), []);
  const meshes = useRef<(T.Mesh | null)[]>([]),
    contacts = useRef<(T.Mesh | null)[]>([]),
    shadows = useRef<(T.Mesh | null)[]>([]);
  const drops = useRef<number[]>(Array(16).fill(0));
  useFrame((_, dt) => {
    if (session.snapDrops) {
      // Returning from a replay: balls already down stay down instead of falling again.
      session.snapDrops = false;
      for (const b of session.world.balls)
        if (b.pocketed) drops.current[b.id] = 0.5;
    }
    for (let i = 0; i < session.world.balls.length; i++) {
      const b = session.world.balls[i],
        m = meshes.current[b.id],
        shadow = shadows.current[b.id],
        contact = contacts.current[b.id];
      if (!m) continue;
      const old = session.previous.find((p) => p.id === b.id) || b,
        a = session.running ? session.alpha : 1;
      if (b.pocketed)
        drops.current[b.id] = Math.min(0.5, drops.current[b.id] + dt);
      else drops.current[b.id] = 0;
      const d = drops.current[b.id];
      m.visible = d < 0.35;
      let x = old.x + (b.x - old.x) * a,
        z = old.z + (b.z - old.z) * a;
      if (b.pocketed) {
        // Roll over the lip towards the pocket centre while falling, instead of sinking in place.
        let best = pocketCenters[0];
        for (const p of pocketCenters)
          if (
            Math.hypot(p[0] - b.x, p[1] - b.z) <
            Math.hypot(best[0] - b.x, best[1] - b.z)
          )
            best = p;
        const k = Math.min(1, d / 0.16);
        x += (best[0] - x) * k;
        z += (best[1] - z) * k;
      }
      m.position.set(x, R - 3 * d * d, z);
      m.quaternion.set(old.qx, old.qy, old.qz, old.qw);
      spinQ.set(b.qx, b.qy, b.qz, b.qw);
      m.quaternion.slerp(spinQ, a);
      if (contact) {
        contact.visible = !b.pocketed;
        contact.position.set(x, 0.0009, z);
      }
      if (shadow) {
        shadow.visible = !b.pocketed;
        shadow.position.set(x + R * 0.42, 0.00085, z + R * 0.5);
      }
    }
  });
  return (
    <group>
      {session.world.balls.map((b) => (
        <React.Fragment key={b.id}>
          <mesh
            ref={(m) => {
              meshes.current[b.id] = m;
            }}
            position={[b.x, R, b.z]}
            rotation={[Math.PI / 2, 0.15, 0]}
          >
            <sphereGeometry args={[R, 48, 32]} />
            <meshPhysicalMaterial
              map={ballTexture(b.id)}
              roughness={0.22}
              metalness={0}
              clearcoat={1}
              clearcoatRoughness={0.04}
              envMapIntensity={1.1}
            />
          </mesh>
          <mesh
            ref={(m) => {
              shadows.current[b.id] = m;
            }}
            renderOrder={2}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[b.x, 0.00085, b.z]}
          >
            <planeGeometry args={[R * 3.1, R * 3.1]} />
            <meshBasicMaterial
              map={contactShadow}
              color="#ffffff"
              transparent
              opacity={0.8}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={(m) => {
              contacts.current[b.id] = m;
            }}
            renderOrder={3}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[b.x, 0.0009, b.z]}
          >
            <planeGeometry args={[R * 1.9, R * 1.9]} />
            <meshBasicMaterial
              map={contactShadow}
              color="#ffffff"
              transparent
              opacity={1}
              depthWrite={false}
            />
          </mesh>
        </React.Fragment>
      ))}
    </group>
  );
}
function Rod({
  length,
  radius,
  color,
  position,
  metalness = 0,
}: {
  length: number;
  radius: number;
  color: string;
  position: number;
  metalness?: number;
}) {
  return (
    <mesh position={[-position, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry args={[radius * 0.74, radius, length, 16]} />
      <meshStandardMaterial
        color={color}
        roughness={0.3}
        metalness={metalness}
      />
    </mesh>
  );
}
function Aim() {
  const cue = useRef<T.Group>(null),
    guide = useRef<T.Group>(null),
    line = useRef<T.Mesh>(null),
    ghost = useRef<T.Mesh>(null),
    objectLine = useRef<T.Mesh>(null),
    cueLine = useRef<T.Mesh>(null),
    forbidden = useRef<T.Group>(null);
  useFrame(() => {
    const b = session.world.balls.find((b) => b.id === 0);
    if (!b || !cue.current || !guide.current) return;
    const elapsed = session.world.time - session.shotStartTime;
    guide.current.visible =
      !session.running &&
      !session.placement &&
      !b.pocketed &&
      !session.progress.finished &&
      !session.progress.breakChoice;
    cue.current.visible =
      (!session.running || elapsed < 0.09) &&
      !session.placement &&
      !b.pocketed &&
      !session.progress.finished &&
      !session.progress.breakChoice;
    const angle = session.angle,
      dx = Math.cos(angle),
      dz = Math.sin(angle);
    const origin = session.running
      ? session.saved?.find((b) => b.id === 0) || b
      : b;
    cue.current.position.set(origin.x, R + session.top * R * 0.5, origin.z);
    const elevation = cueElevation(
      origin.x,
      origin.z,
      angle,
      R + session.top * R * 0.5,
    );
    cue.current.rotation.set(0, -angle, -elevation, "YXZ");
    const pull = session.running
      ? (session.lastShot?.power || 0) *
          0.28 *
          Math.max(0, 1 - elapsed / 0.025) -
        0.015 * Math.min(1, elapsed / 0.09)
      : session.power * 0.28;
    const offset = R + 0.018 + pull * Math.cos(elevation),
      lateral = session.side * R * 0.5;
    cue.current.position.set(
      origin.x - dx * offset - dz * lateral,
      R + session.top * R * 0.5 + pull * Math.sin(elevation),
      origin.z - dz * offset + dx * lateral,
    );
    let dist = 2.7,
      hit: typeof b | undefined;
    for (const o of session.world.balls) {
      if (o.id === 0 || o.pocketed) continue;
      const x = o.x - b.x,
        z = o.z - b.z,
        t = x * dx + z * dz,
        d2 = x * x + z * z - t * t;
      if (t > 0 && d2 < 4 * R * R) {
        const at = t - Math.sqrt(4 * R * R - d2);
        if (at >= 0 && at < dist) {
          dist = at;
          hit = o;
        }
      }
    }
    // Stop the preview at the first cushion; it is intentionally not a full solver.
    const limits = [
      dx > 0 ? (H - R - b.x) / dx : dx < 0 ? (-H + R - b.x) / dx : 99,
      dz > 0 ? (W - R - b.z) / dz : dz < 0 ? (-W + R - b.z) / dz : 99,
    ];
    const edge = Math.min(...limits.filter((t) => t >= 0));
    if (edge < dist) {
      dist = edge;
      hit = undefined;
    }
    const warning =
      hit && session.drill !== "finish"
        ? session.progress.targetWarning(
            hit.id,
            session.drill === "break" && session.shots === 0,
            session.world.balls.map((ball) => ball.id),
          )
        : null;
    if (forbidden.current) {
      forbidden.current.visible = !!warning && !!hit;
      if (hit) forbidden.current.position.set(hit.x, R * 2 + 0.014, hit.z);
    }
    if (line.current)
      (line.current.material as T.MeshBasicMaterial).color.set(
        warning ? "#ff795f" : "#f4f6ef",
      );
    const gx = b.x + dx * dist,
      gz = b.z + dz * dist;
    if (line.current) {
      line.current.position.set(
        b.x + (dx * (dist + R)) / 2,
        0.003,
        b.z + (dz * (dist + R)) / 2,
      );
      line.current.rotation.set(-Math.PI / 2, 0, -angle);
      line.current.scale.set(Math.max(0.001, dist - R), 1, 1);
    }
    if (ghost.current) {
      ghost.current.position.set(gx, 0.002, gz);
      ghost.current.visible = !!hit;
    }
    if (objectLine.current) {
      objectLine.current.visible = !!hit && !warning;
      if (hit) {
        const a = Math.atan2(hit.z - gz, hit.x - gx);
        const reach = session.activeCue.aim;
        const ex = Math.cos(a),
          ez = Math.sin(a);
        const boundary = Math.min(
          ex > 0 ? (H - hit.x) / ex : ex < 0 ? (-H - hit.x) / ex : 99,
          ez > 0 ? (W - hit.z) / ez : ez < 0 ? (-W - hit.z) / ez : 99,
        );
        const length = Math.max(0.01, Math.min(reach, boundary));
        objectLine.current.scale.x = length;
        objectLine.current.position.set(
          hit.x + (Math.cos(a) * length) / 2,
          0.003,
          hit.z + (Math.sin(a) * length) / 2,
        );
        objectLine.current.rotation.set(-Math.PI / 2, 0, -a);
      }
    }
    if (cueLine.current) {
      cueLine.current.visible = !!hit && !warning;
      if (hit) {
        // Cue ball leaves along the tangent line; follow/draw bends it towards/away from the object line.
        // ponytail: first-order preview only, the solver decides the real path.
        const nx = hit.x - gx,
          nz = hit.z - gz,
          nl = Math.hypot(nx, nz) || 1,
          ux = nx / nl,
          uz = nz / nl,
          c = dx * ux + dz * uz;
        let tx = dx - c * ux,
          tz = dz - c * uz;
        const tl = Math.hypot(tx, tz);
        tx = tl > 1e-6 ? tx / tl : 0;
        tz = tl > 1e-6 ? tz / tl : 0;
        const bend = c * session.top * 0.7,
          px = tx * tl + ux * bend,
          pz = tz * tl + uz * bend,
          pl = Math.hypot(px, pz);
        const length =
          Math.min(0.22, 0.05 + pl * 0.2) * (session.activeCue.aim / 0.24);
        cueLine.current.visible = pl > 0.02 && !warning;
        const a = Math.atan2(pz, px);
        cueLine.current.scale.x = Math.max(0.01, length);
        cueLine.current.position.set(
          gx + (Math.cos(a) * length) / 2,
          0.003,
          gz + (Math.sin(a) * length) / 2,
        );
        cueLine.current.rotation.set(-Math.PI / 2, 0, -a);
      }
    }
  });
  return (
    <>
      <group ref={cue}>
        <Rod length={0.68} radius={0.0079} color="#c8ad7d" position={0.34} />
        <Rod
          length={0.43}
          radius={0.0148}
          color={session.activeCue.color}
          position={0.895}
        />
        <Rod length={0.035} radius={0.008} color="#f4e9ce" position={0.0175} />
        <Rod length={0.009} radius={0.008} color="#62a5a0" position={0.004} />
        <Rod
          length={0.02}
          radius={0.0135}
          color="#d1b575"
          metalness={0.75}
          position={0.695}
        />
      </group>
      <group ref={guide}>
        <group ref={forbidden} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh renderOrder={8}>
            <ringGeometry args={[R * 1.12, R * 1.38, 48]} />
            <meshBasicMaterial
              color="#ff5d48"
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh renderOrder={8} rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry args={[R * 2.45, R * 0.24]} />
            <meshBasicMaterial
              color="#ff5d48"
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>

        <mesh ref={line} renderOrder={3} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1, 0.0055]} />
          <meshBasicMaterial
            color="#f4f6ef"
            toneMapped={false}
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={ghost} renderOrder={3} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[R - 0.003, R + 0.0015, 48]} />
          <meshBasicMaterial
            color="#f4f6ef"
            toneMapped={false}
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={objectLine} renderOrder={3}>
          <planeGeometry args={[1, 0.0055]} />
          <meshBasicMaterial
            color="#ffd05b"
            toneMapped={false}
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={cueLine} renderOrder={3}>
          <planeGeometry args={[1, 0.0045]} />
          <meshBasicMaterial
            color="#f4f6ef"
            toneMapped={false}
            transparent
            opacity={0.6}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
}
/** Outer table extents including rails and pocket jaws (from table-mesh.json). */
// Fit to the rail top (diamonds) rather than the outer cabinet: the overhang may bleed off screen.
const TABLE_X = 1.4,
  TABLE_Z = 0.762,
  // A long lens and a slight tilt: the reference reads almost orthographic, which is what keeps
  // it looking like a table seen from above rather than a 3D model on a stage.
  TILT = (7 * Math.PI) / 180;
function Camera() {
  const { camera, size } = useThree();
  const desired = useMemo(() => new T.Vector3(), []);
  const look = useRef(new T.Vector3());
  useFrame((_, dt) => {
    const cam = camera as T.PerspectiveCamera;
    if (session.camera === "aim") {
      const b = session.world.balls.find((b) => b.id === 0)!;
      cam.up.set(0, 1, 0);
      desired.set(
        b.x - Math.cos(session.angle) * 1.05,
        0.54,
        b.z - Math.sin(session.angle) * 1.05,
      );
      look.current.set(
        b.x + Math.cos(session.angle) * 0.7,
        0.01,
        b.z + Math.sin(session.angle) * 0.7,
      );
      camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
      camera.lookAt(look.current);
      return;
    }
    // Nearly overhead, tilted just enough to show the cushion faces and the tops of the balls,
    // and fitted so the table fills the HUD-free rectangle (the reference game's framing).
    const hud = session.hud,
      f = ((cam.fov || 30) * Math.PI) / 180,
      c = Math.cos(TILT),
      safeW = Math.max(40, size.width - hud.left - hud.right),
      safeH = Math.max(40, size.height - hud.top - hud.bottom),
      // Pixels per metre measured perpendicular to the view direction.
      ppm = Math.min(
        safeW / (2 * TABLE_X * 1.02),
        safeH / ((2 * TABLE_Z * c + 0.12 * Math.sin(TILT)) * 1.04),
      ),
      dist = size.height / 2 / (Math.tan(f / 2) * ppm),
      offsetX = (hud.left - hud.right) / 2 / ppm,
      offsetZ = (hud.top - hud.bottom) / 2 / ppm / c;
    cam.up.set(0, 1, 0);
    look.current.set(-offsetX, 0, -offsetZ);
    desired.set(-offsetX, dist * c, -offsetZ + dist * Math.sin(TILT));
    camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    camera.lookAt(look.current);
  });
  return null;
}
/** Permanent head-string marking (owner brief), printed flat on the cloth. Brighter while it restricts placement. */
function HeadString() {
  const mat = useRef<T.MeshBasicMaterial>(null);
  useFrame(() => {
    if (mat.current)
      mat.current.opacity = session.headStringPlacement ? 0.95 : 0.6;
  });
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[-H / 2, 0.0012, 0]}
      renderOrder={2}
    >
      <planeGeometry args={[0.007, 2 * W - 0.02]} />
      <meshBasicMaterial
        ref={mat}
        color="#ffffff"
        transparent
        opacity={0.6}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
export function Scene() {
  const floorShadow = useMemo(() => shadowTexture(), []);
  const floor = useMemo(() => floorTexture(), []);
  const checkFrames = useRef(0);
  const benchmarkReported = useRef(false);
  useFrame(({ gl }) => {
    if (
      (__DEV__ || process.env.EXPO_PUBLIC_NATIVE_BENCHMARK === "1") &&
      ++checkFrames.current === 240
    ) {
      console.info(
        "CueMaster render check",
        JSON.stringify({
          frames: 240,
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          fps: session.fps,
          p95Ms: session.p95,
        }),
      );
      if (
        Platform.OS !== "web" &&
        process.env.EXPO_PUBLIC_NATIVE_BENCHMARK === "1"
      ) {
        session.reset("break");
        session.power = 1;
        session.angle = 0.007;
        session.shoot();
      }
    }
    if (
      (__DEV__ || process.env.EXPO_PUBLIC_NATIVE_BENCHMARK === "1") &&
      Platform.OS !== "web" &&
      process.env.EXPO_PUBLIC_NATIVE_BENCHMARK === "1" &&
      session.lastPerformance &&
      !session.running &&
      !benchmarkReported.current
    ) {
      benchmarkReported.current = true;
      console.info(
        "CueMaster native break benchmark",
        JSON.stringify(session.lastPerformance),
      );
    }
  });
  useFrame((_, dt) => session.update(dt), -1);
  const placingGesture = useRef(false);
  const interact = (e: ThreeEvent<PointerEvent>) => {
    if (session.running || session.cpuTurn || session.progress.breakChoice)
      return;
    if (session.placement) {
      session.placeCue(e.point.x, e.point.z, false);
      return;
    }
    const b = session.world.balls.find((b) => b.id === 0)!;
    session.angle = Math.atan2(e.point.z - b.z, e.point.x - b.x);
  };
  return (
    <>
      <Lighting />
      <Camera />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.285, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial color="#081e30" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.28, 0]}>
        <planeGeometry args={[5.2, 3.4]} />
        <meshBasicMaterial map={floor} toneMapped={false} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.265, 0]}
        scale={[1.55, 0.93, 1]}
      >
        <planeGeometry args={[2.5, 2.5]} />
        <meshBasicMaterial map={floorShadow} transparent depthWrite={false} />
      </mesh>
      <Pockets />
      <Table />
      <CityInlay city={session.skin} />
      <HeadString />
      <Balls />
      <Aim />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        onPointerDown={(e) => {
          if (
            session.running ||
            session.cpuTurn ||
            session.progress.finished ||
            session.progress.breakChoice
          )
            return;
          const cue = session.world.balls.find((b) => b.id === 0)!;
          if (
            session.drill === "break" &&
            session.shots === 0 &&
            Math.hypot(e.point.x - cue.x, e.point.z - cue.z) < R * 2.5
          ) {
            session.placement = true;
            session.headStringPlacement = true;
          }
          placingGesture.current = session.placement;
          (
            e.target as unknown as { setPointerCapture?: (id: number) => void }
          )?.setPointerCapture?.(e.pointerId);
          interact(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1 || e.pointerType === "touch") interact(e);
        }}
        onPointerUp={(e) => {
          if (placingGesture.current && session.placement) {
            // Commit the last valid location, including when released beyond the legal area.
            const cue = session.world.balls.find((b) => b.id === 0)!;
            session.placeCue(cue.x, cue.z);
          }
          placingGesture.current = false;
          (
            e.target as unknown as {
              releasePointerCapture?: (id: number) => void;
            }
          )?.releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => {
          placingGesture.current = false;
        }}
      >
        <planeGeometry args={[2 * H, 2 * W]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}
