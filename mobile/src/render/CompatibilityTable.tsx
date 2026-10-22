import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { session, skins } from "../game/session";
import { H, W, R } from "../physics/engine";
import { ballColors } from "./textures";
import { aimGuide } from "./aimGuide";

/** A GL-independent view of the same world, for devices whose renderer cannot start. */
export default function CompatibilityTable() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [, paint] = useState(0);
  const drag = useRef({ x: 0, y: 0, placing: false });
  const scaleRef = useRef(1);
  useEffect(() => {
    let frame = 0;
    let previous: number | undefined;
    const update = (time: number) => {
      if (previous !== undefined) session.update((time - previous) / 1000);
      previous = time;
      paint((n) => n + 1);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);
  const canAim = () =>
    !session.running &&
    !session.cpuTurn &&
    !session.progress.finished &&
    !session.progress.breakChoice;
  const interact = (x: number, y: number) => {
    if (!canAim()) return;
    const worldX = x / scaleRef.current - H;
    const worldZ = y / scaleRef.current - W;
    const cue = session.world.balls.find((b) => b.id === 0);
    if (!cue) return;
    if (session.placement) session.placeCue(worldX, worldZ, false);
    else session.angle = Math.atan2(worldZ - cue.z, worldX - cue.x);
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: canAim,
        onMoveShouldSetPanResponder: canAim,
        onPanResponderGrant: (event) => {
          const { locationX: x, locationY: y } = event.nativeEvent;
          const cue = session.world.balls.find((b) => b.id === 0);
          if (
            cue &&
            session.drill === "break" &&
            session.shots === 0 &&
            Math.hypot(
              x / scaleRef.current - H - cue.x,
              y / scaleRef.current - W - cue.z,
            ) <
              R * 2.5
          ) {
            session.placement = true;
            session.headStringPlacement = true;
          }
          drag.current = { x, y, placing: session.placement };
          interact(x, y);
        },
        onPanResponderMove: (_event, gesture) =>
          interact(drag.current.x + gesture.dx, drag.current.y + gesture.dy),
        onPanResponderRelease: () => {
          const cue = session.world.balls.find((b) => b.id === 0);
          if (drag.current.placing && session.placement && cue)
            session.placeCue(cue.x, cue.z);
          drag.current.placing = false;
        },
        onPanResponderTerminate: () => {
          drag.current.placing = false;
        },
      }),
    [],
  );
  const hud = session.hud;
  // Same fit as the 3D camera: the cabinet (1.47 x 0.84 m from centre) inside the HUD rectangle.
  const safeWidth = Math.max(1, size.width - hud.left - hud.right);
  const safeHeight = Math.max(1, size.height - hud.top - hud.bottom);
  const scale = Math.min(safeWidth / (2 * 1.47), safeHeight / (2 * 0.84));
  scaleRef.current = scale;
  const width = 2 * H * scale,
    height = 2 * W * scale;
  const left = hud.left + (safeWidth - width) / 2;
  const top = hud.top + (safeHeight - height) / 2;
  const skin = skins[session.skin];
  const diameter = 2 * R * 1.1 * scale;
  const cue = session.world.balls.find((b) => b.id === 0);
  const guide = cue && canAim() && !cue.pocketed && !session.placement;
  const ghost = session.ghost?.world.balls.find((b) => b.id === 0);
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {size.width > 0 && (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.rail,
              {
                left: left - 16,
                top: top - 16,
                width: width + 32,
                height: height + 32,
                backgroundColor: skin.wood,
                borderColor: skin.metal,
              },
            ]}
          />
          <View
            accessibilityLabel="Pool table, compatibility view"
            style={{
              position: "absolute",
              left,
              top,
              width,
              height,
              backgroundColor: skin.cloth,
            }}
            {...responder.panHandlers}
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View
                style={{
                  position: "absolute",
                  left: width / 4,
                  top: 0,
                  width: 1,
                  height,
                  backgroundColor: "#ffffff80",
                }}
              />
              {[
                [0, 0],
                [width / 2, 0],
                [width, 0],
                [0, height],
                [width / 2, height],
                [width, height],
              ].map(([x, y], i) => (
                <View
                  key={i}
                  style={{
                    position: "absolute",
                    left: x - diameter * 0.75,
                    top: y - diameter * 0.75,
                    width: diameter * 1.5,
                    height: diameter * 1.5,
                    borderRadius: diameter,
                    backgroundColor: "#020609",
                  }}
                />
              ))}
              {guide && (
                <View
                  style={{
                    position: "absolute",
                    left: (cue.x + H) * scale,
                    top: (cue.z + W) * scale - 1,
                    width:
                      aimGuide(session.world.balls, session.angle).distance *
                      scale,
                    height: 2,
                    backgroundColor: "#ffffffa0",
                    transformOrigin: "left center",
                    transform: [{ rotate: `${session.angle}rad` }],
                  }}
                />
              )}
              {ghost && !ghost.pocketed && !session.replaying && (
                <View
                  style={{
                    position: "absolute",
                    left: (ghost.x + H) * scale - diameter / 2,
                    top: (ghost.z + W) * scale - diameter / 2,
                    width: diameter,
                    height: diameter,
                    borderRadius: diameter,
                    backgroundColor: "#9fe8ff",
                    opacity: 0.35,
                  }}
                />
              )}
              {session.world.balls
                .filter((ball) => !ball.pocketed)
                .map((ball) => (
                  <View
                    key={ball.id}
                    style={[
                      styles.ball,
                      {
                        left: (ball.x + H) * scale - diameter / 2,
                        top: (ball.z + W) * scale - diameter / 2,
                        width: diameter,
                        height: diameter,
                        borderRadius: diameter / 2,
                        backgroundColor:
                          ball.id > 8 ? "#faf9f2" : ballColors[ball.id],
                      },
                    ]}
                  >
                    {ball.id > 8 && (
                      <View
                        style={{
                          position: "absolute",
                          top: diameter * 0.24,
                          width: diameter,
                          height: diameter * 0.52,
                          backgroundColor: ballColors[ball.id],
                        }}
                      />
                    )}
                    {ball.id > 0 && (
                      <View
                        style={{
                          width: diameter * 0.48,
                          height: diameter * 0.48,
                          borderRadius: diameter / 2,
                          backgroundColor: "#faf9f2",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: Math.max(6, diameter * 0.28),
                            fontWeight: "800",
                            color: "#111",
                          }}
                        >
                          {ball.id}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
            </View>
          </View>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  rail: { position: "absolute", borderWidth: 3, borderRadius: 22 },
  ball: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#00000060",
    boxShadow: "2px 3px 2px #00000066",
  },
});
