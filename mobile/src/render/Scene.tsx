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
import { ballTexture, grain, shadowTexture, clothSurface } from "./textures";
const spinQ = new T.Quaternion();
function Lighting() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new T.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.04, 0.1, 100, { size: 128 });
    scene.environment = env.texture;
    scene.environmentIntensity = 0.35;
    return () => {
      scene.environment = null;
      env.dispose();
      room.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight
        position={[-0.4, 1.8, -0.25]}
        intensity={1.6}
        color="#fff4e5"
        distance={6}
        decay={2}
      />
      <hemisphereLight args={["#fbf2d5", "#162c24", 0.65]} />
      <directionalLight
        position={[-1, 3, 1]}
        intensity={1.15}
        color="#fff0d4"
      />
      <directionalLight
        position={[1, 2, -2]}
        intensity={0.45}
        color="#d9e8ff"
      />
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
              bumpMap={name === "cloth" ? textures.weave : null}
              bumpScale={0.00015}
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
                    ivory: "#d7d1b1",
                  } as any
                )[name]
              }
              roughness={
                name === "cloth" || name === "cushion"
                  ? 0.92
                  : name === "wood"
                    ? 0.55
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
                name === "leather" ? 0.08 : name === "cloth" ? 0.25 : 0.65
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
function Balls() {
  const contactShadow = useMemo(() => shadowTexture(), []);
  const meshes = useRef<(T.Mesh | null)[]>([]),
    shadows = useRef<(T.Mesh | null)[]>([]);
  const drops = useRef<number[]>(Array(16).fill(0));
  useFrame((_, dt) => {
    for (let i = 0; i < session.world.balls.length; i++) {
      const b = session.world.balls[i],
        m = meshes.current[b.id],
        shadow = shadows.current[b.id];
      if (!m) continue;
      const old = session.previous.find((p) => p.id === b.id) || b,
        a = session.running ? session.alpha : 1;
      if (b.pocketed)
        drops.current[b.id] = Math.min(0.5, drops.current[b.id] + dt);
      else drops.current[b.id] = 0;
      const d = drops.current[b.id];
      m.visible = d < 0.35;
      m.position.set(
        old.x + (b.x - old.x) * a,
        R - 3 * d * d,
        old.z + (b.z - old.z) * a,
      );
      m.quaternion.set(old.qx, old.qy, old.qz, old.qw);
      spinQ.set(b.qx, b.qy, b.qz, b.qw);
      m.quaternion.slerp(spinQ, a);
      if (shadow) {
        shadow.visible = !b.pocketed;
        shadow.position.set(m.position.x, 0.0008, m.position.z);
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
            <sphereGeometry args={[R, 32, 20]} />
            <meshStandardMaterial
              map={ballTexture(b.id)}
              roughness={0.18}
              metalness={0}
              envMapIntensity={0.5}
            />
          </mesh>
          <mesh
            ref={(m) => {
              shadows.current[b.id] = m;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[b.x, 0.0008, b.z]}
          >
            <planeGeometry args={[R * 3.2, R * 3.2]} />
            <meshBasicMaterial
              map={contactShadow}
              color="#ffffff"
              transparent
              opacity={0.95}
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
        warning ? "#ff795f" : "#65e6ff",
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
        objectLine.current.scale.x = length / 0.24;
        objectLine.current.position.set(
          hit.x + (Math.cos(a) * length) / 2,
          0.003,
          hit.z + (Math.sin(a) * length) / 2,
        );
        objectLine.current.rotation.set(-Math.PI / 2, 0, -a);
      }
    }
  });
  return (
    <>
      <group ref={cue}>
        <Rod length={0.68} radius={0.0058} color="#c8ad7d" position={0.34} />
        <Rod
          length={0.43}
          radius={0.011}
          color={session.activeCue.color}
          position={0.895}
        />
        <Rod length={0.035} radius={0.006} color="#f4e9ce" position={0.0175} />
        <Rod length={0.009} radius={0.006} color="#62a5a0" position={0.004} />
        <Rod
          length={0.02}
          radius={0.01}
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
          <planeGeometry args={[1, 0.012]} />
          <mesh renderOrder={2} position={[0, 0, -0.0005]}>
            <planeGeometry args={[1, 0.023]} />
            <meshBasicMaterial
              color="#071521"
              transparent
              opacity={0.85}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <meshBasicMaterial
            color="#65e6ff"
            toneMapped={false}
            transparent
            opacity={1}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={ghost} renderOrder={3} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[R - 0.0035, R + 0.002, 48]} />
          <meshBasicMaterial
            color="#65e6ff"
            toneMapped={false}
            depthWrite={false}
          />
          <mesh renderOrder={2} position={[0, 0, -0.0005]}>
            <ringGeometry args={[R - 0.006, R + 0.005, 48]} />
            <meshBasicMaterial color="#071521" toneMapped={false} />
          </mesh>
        </mesh>
        <mesh ref={objectLine}>
          <planeGeometry args={[0.24, 0.01]} />
          <meshBasicMaterial
            color="#ffd05b"
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
}
function Camera() {
  const { camera, size } = useThree();
  const desired = useMemo(() => new T.Vector3(), []);
  const look = useRef(new T.Vector3());
  useFrame((_, dt) => {
    const aspect = size.width / size.height;
    if (session.camera === "aim") {
      const b = session.world.balls.find((b) => b.id === 0)!;
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
    } else {
      const d = Math.max(2.22, 4.25 / aspect);
      desired.set(0, d, d * 0.4);
      look.current.set(0, 0, 0);
    }
    camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    camera.lookAt(look.current);
  });
  return null;
}
export function Scene() {
  const floorShadow = useMemo(() => shadowTexture(), []);
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
    if (session.running || session.cpuTurn || session.progress.breakChoice) return;
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.28, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#081e30" toneMapped={false} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.265, 0]}
        scale={[1.55, 0.93, 1]}
      >
        <planeGeometry args={[2.5, 2.5]} />
        <meshBasicMaterial map={floorShadow} transparent depthWrite={false} />
      </mesh>
      <Table />
      <CityInlay city={session.skin} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-H / 2, 0.012, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[0.014, 2 * W - 0.02]} />
        <meshBasicMaterial
          color="#ffffff"
          side={T.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <Balls />
      <Aim />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        onPointerDown={(e) => {
          if (session.running || session.cpuTurn || session.progress.finished || session.progress.breakChoice) return;
          const cue = session.world.balls.find((b) => b.id === 0)!;
          if (session.drill === "break" && session.shots === 0 &&
              Math.hypot(e.point.x - cue.x, e.point.z - cue.z) < R * 2.5) {
            session.placement = true;
            session.headStringPlacement = true;
          }
          placingGesture.current = session.placement;
          (e.target as unknown as { setPointerCapture?: (id: number) => void })?.setPointerCapture?.(e.pointerId);
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
          (e.target as unknown as { releasePointerCapture?: (id: number) => void })?.releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => { placingGesture.current = false; }}
      >
        <planeGeometry args={[2 * H, 2 * W]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}
