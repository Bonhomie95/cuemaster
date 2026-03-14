// File: mobile/src/game/TableRenderer.tsx

import React, { useMemo } from 'react';
import {
  Canvas, Rect, Circle, Line, Path, Skia, Group,
  RadialGradient, vec, Paint, Text as SkiaText, matchFont,
} from '@shopify/react-native-skia';
import { BallState, TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, BALL_COLORS, IS_STRIPE } from '../types/game';

// ── Layout ────────────────────────────────────────────────────────────────────

interface TableLayout {
  canvasW:  number;
  canvasH:  number;
  scale:    number;
  offsetX:  number;
  offsetY:  number;
  cushion:  number;
}

export function getTableLayout(screenW: number, screenH: number): TableLayout {
  const padding = 12;
  const usableW = screenW - padding * 2;
  const usableH = screenH - padding * 2;
  const scaleX  = usableW / TABLE_WIDTH;
  const scaleY  = usableH / TABLE_HEIGHT;
  const scale   = Math.min(scaleX, scaleY);

  const tableW = TABLE_WIDTH  * scale;
  const tableH = TABLE_HEIGHT * scale;

  return {
    canvasW: screenW,
    canvasH: screenH,
    scale,
    offsetX: (screenW - tableW) / 2,
    offsetY: (screenH - tableH) / 2,
    cushion: 50 * scale,
  };
}

function mmToCanvas(mm: number, scale: number): number {
  return mm * scale;
}

// ── Pocket positions ──────────────────────────────────────────────────────────

function pocketPositions(layout: TableLayout) {
  const { scale, offsetX, offsetY, cushion } = layout;
  const W = TABLE_WIDTH  * scale;
  const H = TABLE_HEIGHT * scale;
  const cr = 57 * scale;  // corner pocket radius
  const sr = 65 * scale;  // side pocket radius

  return [
    { x: offsetX,           y: offsetY,           r: cr },
    { x: offsetX + W,       y: offsetY,           r: cr },
    { x: offsetX,           y: offsetY + H,       r: cr },
    { x: offsetX + W,       y: offsetY + H,       r: cr },
    { x: offsetX + W / 2,   y: offsetY,           r: sr },
    { x: offsetX + W / 2,   y: offsetY + H,       r: sr },
  ];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TableRendererProps {
  layout:    TableLayout;
  balls:     BallState[];
  aimAngle?: number;      // radians — shown only during aiming
  aimLine?:  boolean;
  cueBallX?: number;      // mm — for ball-in-hand ghost
  cueBallY?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TableRenderer: React.FC<TableRendererProps> = ({
  layout, balls, aimAngle, aimLine = false, cueBallX, cueBallY,
}) => {
  const { scale, offsetX, offsetY, cushion } = layout;
  const tableW = TABLE_WIDTH  * scale;
  const tableH = TABLE_HEIGHT * scale;
  const br     = BALL_RADIUS  * scale;

  const pockets = useMemo(() => pocketPositions(layout), [layout]);
  const activeBalls = useMemo(() => balls.filter(b => !b.isPocketed), [balls]);

  // Aim line: from cue ball outward in aim direction
  const cue = activeBalls.find(b => b.id === 0);
  const aimLinePath = useMemo(() => {
    if (!aimLine || aimAngle === undefined || !cue) return null;
    const cx = offsetX + cue.x * scale;
    const cy = offsetY + cue.y * scale;
    const len = 300;
    const ex  = cx + Math.cos(aimAngle) * len;
    const ey  = cy + Math.sin(aimAngle) * len;
    const path = Skia.Path.Make();
    path.moveTo(cx, cy);
    path.lineTo(ex, ey);
    return path;
  }, [aimLine, aimAngle, cue, offsetX, offsetY, scale]);

  return (
    <Canvas style={{ width: layout.canvasW, height: layout.canvasH }}>

      {/* ── Table bed ─────────────────────────────────────────────────── */}
      <Rect
        x={offsetX} y={offsetY}
        width={tableW} height={tableH}
        color="#2D5016"
      />

      {/* ── Felt texture band (inner play area) ───────────────────────── */}
      <Rect
        x={offsetX + cushion} y={offsetY + cushion}
        width={tableW - cushion * 2} height={tableH - cushion * 2}
        color="#2E6B1A"
      />

      {/* ── Rail / cushion border ─────────────────────────────────────── */}
      <Rect
        x={offsetX} y={offsetY}
        width={tableW} height={tableH}
        color="transparent"
        style="stroke"
        strokeWidth={cushion * 0.8}
      />

      {/* ── Head string marker ────────────────────────────────────────── */}
      <Line
        p1={vec(offsetX + tableW * 0.25, offsetY + cushion)}
        p2={vec(offsetX + tableW * 0.25, offsetY + tableH - cushion)}
        color="rgba(255,255,255,0.15)"
        strokeWidth={1}
      />

      {/* ── Foot spot dot ─────────────────────────────────────────────── */}
      <Circle
        cx={offsetX + tableW * 0.75}
        cy={offsetY + tableH * 0.5}
        r={3}
        color="rgba(255,255,255,0.4)"
      />

      {/* ── Pockets ───────────────────────────────────────────────────── */}
      {pockets.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={p.r} color="#111111" />
      ))}

      {/* ── Aim line ──────────────────────────────────────────────────── */}
      {aimLinePath && (
        <Path
          path={aimLinePath}
          color="rgba(255,255,255,0.55)"
          style="stroke"
          strokeWidth={1.5}
        />
      )}

      {/* ── Ghost cue ball (ball-in-hand) ──────────────────────────────── */}
      {cueBallX !== undefined && cueBallY !== undefined && (
        <Circle
          cx={offsetX + cueBallX * scale}
          cy={offsetY + cueBallY * scale}
          r={br}
          color="rgba(245,245,220,0.35)"
          style="stroke"
          strokeWidth={1.5}
        />
      )}

      {/* ── Balls ─────────────────────────────────────────────────────── */}
      {activeBalls.map(ball => {
        const cx = offsetX + ball.x * scale;
        const cy = offsetY + ball.y * scale;
        const color = BALL_COLORS[ball.id] ?? '#CCCCCC';
        const isStripe = IS_STRIPE[ball.id] ?? false;

        return (
          <Group key={ball.id}>
            {/* Base colour */}
            <Circle cx={cx} cy={cy} r={br} color={color} />

            {/* Stripe band for striped balls */}
            {isStripe && (
              <Circle cx={cx} cy={cy} r={br * 0.45} color="#F5F5DC" />
            )}

            {/* Shine highlight */}
            <Circle
              cx={cx - br * 0.28}
              cy={cy - br * 0.28}
              r={br * 0.25}
              color="rgba(255,255,255,0.45)"
            />

            {/* Ball number for non-cue balls */}
            {ball.id > 0 && (
              <Circle cx={cx} cy={cy} r={br * 0.38} color="rgba(255,255,255,0.9)" />
            )}
          </Group>
        );
      })}

    </Canvas>
  );
};
