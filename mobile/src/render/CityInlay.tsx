import React, { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
// Original city landmark linework, drawn with physical stroke width on the cloth.
const landmarks: number[][][][] = [
  [
    [
      [-1, 0],
      [1, 0],
    ],
    [
      [-0.55, 0],
      [-0.55, 0.8],
    ],
    [
      [0.55, 0],
      [0.55, 0.8],
    ],
    [
      [-1, 0.15],
      [-0.55, 0.7],
      [0, 0.15],
      [0.55, 0.7],
      [1, 0.15],
    ],
    [
      [-0.8, 0],
      [-0.8, 0.35],
    ],
    [
      [-0.3, 0],
      [-0.3, 0.4],
    ],
    [
      [0.3, 0],
      [0.3, 0.4],
    ],
    [
      [0.8, 0],
      [0.8, 0.35],
    ],
  ],
  [
    [
      [-0.35, 0],
      [-0.35, 0.8],
      [-0.2, 0.8],
      [0, 1.1],
      [0.2, 0.8],
      [0.35, 0.8],
      [0.35, 0],
    ],
    [
      [-0.45, 0.65],
      [0.45, 0.65],
    ],
    [
      [-0.45, 0.8],
      [0.45, 0.8],
    ],
    [
      [-0.2, 0.5],
      [0.2, 0.5],
      [0.2, 0.2],
      [-0.2, 0.2],
      [-0.2, 0.5],
    ],
  ],
  [
    [
      [-0.6, 0],
      [0, 1.2],
      [0.6, 0],
    ],
    [
      [-0.45, 0.3],
      [0.45, 0.3],
    ],
    [
      [-0.25, 0.7],
      [0.25, 0.7],
    ],
    [
      [-0.6, 0],
      [-0.2, 0.25],
      [0.2, 0.25],
      [0.6, 0],
    ],
    [
      [0, 1.2],
      [0, 1.35],
    ],
  ],
  [
    [
      [-0.6, 0],
      [-0.6, 0.85],
    ],
    [
      [0.6, 0],
      [0.6, 0.85],
    ],
    [
      [-0.9, 0.8],
      [-0.7, 0.72],
      [0.7, 0.72],
      [0.9, 0.8],
    ],
    [
      [-0.8, 0.55],
      [0.8, 0.55],
    ],
    [
      [-0.2, 0.55],
      [-0.2, 0.72],
    ],
    [
      [0.2, 0.55],
      [0.2, 0.72],
    ],
  ],
  [
    [
      [-0.4, 0],
      [-0.4, 0.35],
      [-0.25, 0.35],
      [-0.25, 0.7],
      [-0.12, 0.7],
      [-0.12, 1],
      [0, 1.4],
      [0.12, 1],
      [0.12, 0.7],
      [0.25, 0.7],
      [0.25, 0.35],
      [0.4, 0.35],
      [0.4, 0],
    ],
    [
      [0, 0],
      [0, 1.4],
    ],
  ],
  [
    [
      [-0.8, 0],
      [-0.8, 0.45],
      [-0.5, 0.45],
      [-0.5, 0],
    ],
    [
      [-0.3, 0],
      [-0.3, 0.85],
      [-0.15, 0.85],
      [-0.15, 1.05],
      [0, 1.3],
      [0.15, 1.05],
      [0.15, 0.85],
      [0.3, 0.85],
      [0.3, 0],
    ],
    [
      [0.5, 0],
      [0.5, 0.65],
      [0.8, 0.65],
      [0.8, 0],
    ],
  ],
];
// Westminster-inspired tower: stepped crown, clock face, stone bays and plinth.
landmarks[1] = [
  [
    [-0.32, 0],
    [0.32, 0],
  ],
  [
    [-0.25, 0],
    [-0.25, 0.78],
    [-0.3, 0.78],
    [-0.3, 1.06],
    [-0.23, 1.06],
    [-0.23, 1.18],
    [0, 1.4],
    [0.23, 1.18],
    [0.23, 1.06],
    [0.3, 1.06],
    [0.3, 0.78],
    [0.25, 0.78],
    [0.25, 0],
  ],
  [
    [-0.3, 1.06],
    [0.3, 1.06],
  ],
  [
    [-0.3, 0.78],
    [0.3, 0.78],
  ],
  [
    [-0.23, 1.18],
    [0.23, 1.18],
  ],
  [
    [-0.16, 0.1],
    [-0.16, 0.65],
  ],
  [
    [0, 0.1],
    [0, 0.65],
  ],
  [
    [0.16, 0.1],
    [0.16, 0.65],
  ],
  [
    [-0.25, 0.15],
    [0.25, 0.15],
  ],
  [
    [-0.25, 0.69],
    [0.25, 0.69],
  ],
  Array.from({ length: 33 }, (_, i) => [
    Math.cos((i / 32) * Math.PI * 2) * 0.105,
    0.92 + Math.sin((i / 32) * Math.PI * 2) * 0.105,
  ]),
];
/** A small arch, base `y`, centred on `x`: the Colosseum's bays and the Gateway's side doors. */
const arch = (x: number, y: number, w = 0.08, h = 0.24) => [
  [x - w, y],
  [x - w, y + h * 0.62],
  [x, y + h],
  [x + w, y + h * 0.62],
  [x + w, y],
];
const ring = (x: number, y: number, r: number, from = 0, to = Math.PI * 2) =>
  Array.from({ length: 25 }, (_, i) => [
    x + Math.cos(from + ((to - from) * i) / 24) * r,
    y + Math.sin(from + ((to - from) * i) / 24) * r,
  ]);
const waves = (y: number) =>
  Array.from({ length: 9 }, (_, i) => [-0.96 + i * 0.24, y + (i % 2) * 0.06]);
// Cape Town: Lion's Head, Table Mountain under its tablecloth cloud, Devil's Peak.
landmarks[6] = [
  [
    [-1, 0],
    [1, 0],
  ],
  [
    [-0.98, 0],
    [-0.86, 0.32],
    [-0.78, 0.5],
    [-0.7, 0.44],
    [-0.6, 0.18],
  ],
  [
    [-0.6, 0.18],
    [-0.5, 0.62],
    [-0.44, 0.7],
    [0.44, 0.7],
    [0.5, 0.62],
    [0.56, 0.4],
  ],
  [
    [0.56, 0.4],
    [0.72, 0.62],
    [0.84, 0.3],
    [0.96, 0],
  ],
  [
    [-0.4, 0.82],
    [-0.15, 0.88],
    [0.12, 0.86],
    [0.4, 0.82],
  ],
  waves(-0.16),
];
// Rio: Christ on Corcovado, the cable car up to Sugarloaf.
landmarks[7] = [
  [
    [-1, 0],
    [1, 0],
  ],
  [
    [-1, 0],
    [-0.85, 0.45],
    [-0.72, 0.8],
    [-0.62, 0.84],
    [-0.5, 0.6],
    [-0.36, 0],
  ],
  [
    [-0.66, 0.84],
    [-0.66, 1.16],
  ],
  [
    [-0.8, 1.08],
    [-0.52, 1.08],
  ],
  ring(-0.66, 1.21, 0.045),
  [
    [-0.26, 0],
    [-0.15, 0.25],
    [0, 0.34],
    [0.12, 0.25],
    [0.2, 0],
  ],
  [
    [0.2, 0],
    [0.3, 0.45],
    [0.42, 0.7],
    [0.55, 0.78],
    [0.68, 0.7],
    [0.78, 0.45],
    [0.86, 0],
  ],
  [
    [0, 0.34],
    [0.55, 0.78],
  ],
  [
    [0.25, 0.48],
    [0.25, 0.6],
    [0.33, 0.6],
    [0.33, 0.48],
    [0.25, 0.48],
  ],
];
// Cairo: the three pyramids of Giza under a desert sun.
landmarks[8] = [
  [
    [-1, 0],
    [1, 0],
  ],
  [
    [-0.55, 0],
    [-0.05, 0.85],
    [0.45, 0],
  ],
  [
    [-0.05, 0.85],
    [0.08, 0],
  ],
  [
    [0.3, 0.26],
    [0.55, 0.62],
    [0.92, 0],
  ],
  [
    [0.55, 0.62],
    [0.62, 0],
  ],
  [
    [-0.96, 0],
    [-0.76, 0.34],
    [-0.56, 0],
  ],
  ring(0.66, 1.02, 0.12),
];
// Mumbai: the Gateway of India, its great arch, turrets and central dome.
landmarks[9] = [
  [
    [-0.75, 0],
    [0.75, 0],
  ],
  [
    [-0.6, 0],
    [-0.6, 0.9],
    [0.6, 0.9],
    [0.6, 0],
  ],
  arch(0, 0, 0.22, 0.72),
  [
    [-0.6, 0.78],
    [0.6, 0.78],
  ],
  [
    [-0.6, 0.9],
    [-0.6, 1.05],
    [-0.45, 1.05],
    [-0.45, 0.9],
  ],
  [
    [0.45, 0.9],
    [0.45, 1.05],
    [0.6, 1.05],
    [0.6, 0.9],
  ],
  [
    [-0.2, 0.9],
    [-0.15, 1.02],
    [0, 1.1],
    [0.15, 1.02],
    [0.2, 0.9],
  ],
  arch(-0.42, 0.3),
  arch(0.42, 0.3),
];
// Rome: the Colosseum, two tiers of bays and the broken upper wall.
landmarks[10] = [
  [
    [-1, 0],
    [1, 0],
  ],
  [
    [-0.9, 0],
    [-0.9, 0.9],
    [0.4, 0.9],
    [0.9, 0.62],
    [0.9, 0],
  ],
  [
    [-0.9, 0.3],
    [0.9, 0.3],
  ],
  [
    [-0.9, 0.6],
    [0.9, 0.6],
  ],
  ...[-3, -2, -1, 0, 1, 2, 3].flatMap((i) => [
    arch(i * 0.24, 0),
    arch(i * 0.24, 0.3),
  ]),
];
// Sydney: the Opera House shells and the Harbour Bridge arch.
landmarks[11] = [
  [
    [-1, 0],
    [1, 0],
  ],
  [
    [-0.66, 0],
    [-0.66, 0.1],
    [0.42, 0.1],
    [0.42, 0],
  ],
  [
    [-0.62, 0.1],
    [-0.54, 0.42],
    [-0.4, 0.66],
    [-0.3, 0.7],
    [-0.28, 0.1],
  ],
  [
    [-0.3, 0.1],
    [-0.2, 0.5],
    [-0.05, 0.82],
    [0.05, 0.86],
    [0.08, 0.1],
  ],
  [
    [0.08, 0.1],
    [0.16, 0.4],
    [0.28, 0.6],
    [0.36, 0.62],
    [0.4, 0.1],
  ],
  [
    [0.46, 0.3],
    [1, 0.3],
  ],
  [
    [0.48, 0.3],
    [0.56, 0.52],
    [0.7, 0.66],
    [0.84, 0.66],
    [0.95, 0.52],
    [1, 0.42],
  ],
  [
    [0.62, 0.3],
    [0.62, 0.58],
  ],
  [
    [0.77, 0.3],
    [0.77, 0.67],
  ],
  [
    [0.92, 0.3],
    [0.92, 0.56],
  ],
];
// Singapore: Marina Bay Sands with its skypark, a Supertree beside it.
landmarks[12] = [
  [
    [-1, 0],
    [1, 0],
  ],
  ...[-0.4, 0, 0.4].flatMap((x) => [
    [
      [x - 0.1, 0],
      [x - 0.06, 0.9],
    ],
    [
      [x + 0.1, 0],
      [x + 0.06, 0.9],
    ],
  ]),
  [
    [-0.66, 0.9],
    [0.72, 0.9],
    [0.64, 1.0],
    [-0.56, 1.0],
    [-0.66, 0.9],
  ],
  [
    [-0.86, 0],
    [-0.86, 0.5],
  ],
  [
    [-0.99, 0.5],
    [-0.86, 0.64],
    [-0.73, 0.5],
    [-0.99, 0.5],
  ],
];
// Monaco: a yacht in the harbour at Monte Carlo.
landmarks[13] = [
  [
    [-0.72, 0.1],
    [0.55, 0.1],
    [0.78, 0.26],
    [-0.78, 0.26],
    [-0.72, 0.1],
  ],
  [
    [-0.45, 0.26],
    [-0.4, 0.42],
    [0.3, 0.42],
    [0.42, 0.26],
  ],
  [
    [-0.3, 0.42],
    [-0.25, 0.55],
    [0.15, 0.55],
    [0.2, 0.42],
  ],
  [
    [0, 0.55],
    [0, 0.88],
  ],
  [
    [0, 0.88],
    [0.32, 0.62],
  ],
  waves(-0.06),
  ring(0.72, 0.62, 0.16, 0, Math.PI),
  [
    [0.54, 0.62],
    [0.9, 0.62],
  ],
];
const colors = [
  "#d8ba7b",
  "#b8c9d6",
  "#e1b4aa",
  "#acb7df",
  "#b8d4b7",
  "#dfc484",
  "#e3b8d0",
  "#ffd59a",
  "#e8c98a",
  "#f0c987",
  "#efe2c4",
  "#e6eef5",
  "#d7c8f0",
  "#f1d27a",
];
/**
 * One living light per city, in landmark coordinates: Lagos bridge lamps, Paris beacon,
 * Tokyo lantern, Dubai spire, New York windows, then the cable cars, capstones, domes and masts
 * of the high-stakes cities. London keeps its clock hand.
 */
const beacons: Record<number, { at: [number, number]; period: number }[]> = {
  0: [
    { at: [-0.8, 0.35], period: 1.1 },
    { at: [-0.3, 0.4], period: 1.3 },
    { at: [0.3, 0.4], period: 1.7 },
    { at: [0.8, 0.35], period: 1.9 },
  ],
  2: [{ at: [0, 1.35], period: 2.4 }],
  3: [{ at: [0, 0.64], period: 3.2 }],
  4: [{ at: [0, 1.4], period: 1.6 }],
  5: [
    { at: [-0.65, 0.3], period: 2.1 },
    { at: [0, 0.6], period: 2.9 },
    { at: [0.65, 0.4], period: 2.5 },
  ],
  6: [{ at: [0.3, 0.7], period: 2.6 }],
  7: [{ at: [0.29, 0.54], period: 1.8 }],
  8: [{ at: [-0.05, 0.85], period: 3.1 }],
  9: [{ at: [0, 1.1], period: 2.2 }],
  10: [{ at: [0.4, 0.9], period: 2.7 }],
  11: [{ at: [0.77, 0.67], period: 1.9 }],
  12: [
    { at: [-0.4, 1.0], period: 1.7 },
    { at: [0.4, 1.0], period: 2.3 },
  ],
  13: [{ at: [0, 0.88], period: 1.5 }],
};
export default function CityInlay({ city }: { city: number }) {
  const orbit = useRef<T.Group>(null);
  const hand = useRef<T.Group>(null);
  const lights = useRef<(T.Mesh | null)[]>([]);
  const { geometry, center } = useMemo(() => {
    const pieces: T.BufferGeometry[] = [];
    for (const path of landmarks[city] || landmarks[0]) {
      for (let i = 1; i < path.length; i++) {
        const [ax, ay] = path[i - 1].map((n) => n * 0.24);
        const [bx, by] = path[i].map((n) => n * 0.24);
        const length = Math.hypot(bx - ax, by - ay);
        if (!length) continue;
        const nx = (-(by - ay) / length) * 0.006;
        const ny = ((bx - ax) / length) * 0.006;
        const shape = new T.Shape();
        shape.moveTo(ax + nx, ay + ny);
        shape.lineTo(bx + nx, by + ny);
        shape.lineTo(bx - nx, by - ny);
        shape.lineTo(ax - nx, ay - ny);
        shape.closePath();
        const part = new T.ExtrudeGeometry(shape, {
          // A shallow inlay: at ball height the old 4 mm relief looked like a sculpture the
          // balls rolled through. Still beveled and metallic, just closer to the cloth.
          depth: 0.0016,
          bevelEnabled: true,
          bevelSegments: 1,
          steps: 1,
          bevelSize: 0.0016,
          bevelThickness: 0.0008,
        });
        part.rotateX(-Math.PI / 2);
        pieces.push(part);
      }
    }
    const result = mergeGeometries(pieces, false)!;
    pieces.forEach((piece) => piece.dispose());
    result.computeBoundingBox();
    const center = result.boundingBox!.getCenter(new T.Vector3());
    result.translate(-center.x, 0, -center.z);
    return { geometry: result, center };
  }, [city]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (orbit.current) orbit.current.rotation.y = clock.elapsedTime * 0.06;
    if (hand.current) hand.current.rotation.y = clock.elapsedTime * 0.18;
    (beacons[city] || []).forEach((b, i) => {
      const m = lights.current[i];
      if (!m) return;
      const glow =
        0.55 + 0.45 * Math.sin((clock.elapsedTime * Math.PI * 2) / b.period);
      m.scale.setScalar(0.8 + glow * 0.5);
      (m.material as T.MeshBasicMaterial).opacity = 0.35 + glow * 0.6;
    });
  });
  const color = colors[city] || colors[0];
  return (
    <group position={[0.635, 0.0007, 0]}>
      {/* A shallow inlay centred across the rack half: readable, but the balls stay the subject. */}
      <mesh geometry={geometry} position={[0.0035, -0.0015, 0.0045]}>
        <meshBasicMaterial
          color="#03131c"
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={color}
          metalness={0.55}
          roughness={0.34}
          emissive={color}
          emissiveIntensity={0.1}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <ringGeometry args={[0.286, 0.2885, 96]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>
      <group ref={orbit}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
          <ringGeometry args={[0.286, 0.2905, 40, 1, 0, Math.PI * 0.3]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.75}
            depthWrite={false}
          />
        </mesh>
      </group>
      {(beacons[city] || []).map((b, i) => (
        <mesh
          key={i}
          ref={(m) => {
            lights.current[i] = m;
          }}
          position={[
            b.at[0] * 0.24 - center.x,
            0.004,
            -b.at[1] * 0.24 - center.z,
          ]}
        >
          <sphereGeometry args={[0.0045, 10, 8]} />
          <meshBasicMaterial
            color="#fff2c4"
            transparent
            opacity={0.8}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      ))}
      {city === 1 && (
        <group ref={hand} position={[0, 0.006, -0.053]}>
          <mesh position={[0.014, 0, 0]}>
            <boxGeometry args={[0.028, 0.002, 0.003]} />
            <meshBasicMaterial color="#fff5d7" toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
