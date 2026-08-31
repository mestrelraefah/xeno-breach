// ============ Procedural billboard sprites (cached canvases) ============

export const SPR = 64;

const cache = new Map<string, HTMLCanvasElement>();

function mk(size = SPR): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function shadow(ctx: CanvasRenderingContext2D, w = 34, y = 58): void {
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(32, y, w / 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function humanoid(ctx: CanvasRenderingContext2D, a: string, b: string, helmet = false): void {
  shadow(ctx);
  // legs
  ctx.fillStyle = shade(a, 0.55);
  ctx.fillRect(22, 40, 8, 18);
  ctx.fillRect(34, 40, 8, 18);
  ctx.fillStyle = shade(a, 0.35);
  ctx.fillRect(22, 54, 8, 4);
  ctx.fillRect(34, 54, 8, 4);
  // torso
  ctx.fillStyle = shade(a, 0.85);
  ctx.beginPath();
  ctx.moveTo(20, 22); ctx.lineTo(44, 22); ctx.lineTo(46, 42); ctx.lineTo(18, 42);
  ctx.closePath(); ctx.fill();
  // chest glow strip
  ctx.fillStyle = b;
  ctx.fillRect(28, 26, 8, 3);
  ctx.fillStyle = shade(a, 0.6);
  ctx.fillRect(20, 36, 24, 3);
  // shoulders
  ctx.fillStyle = shade(a, 1.1);
  ctx.fillRect(16, 22, 7, 8);
  ctx.fillRect(41, 22, 7, 8);
  // arm + gun
  ctx.fillStyle = shade(a, 0.7);
  ctx.fillRect(42, 28, 6, 10);
  ctx.fillStyle = "#181c20";
  ctx.fillRect(40, 30, 18, 4);
  ctx.fillStyle = b;
  ctx.fillRect(56, 31, 3, 2);
  // head
  ctx.fillStyle = shade(a, helmet ? 1.15 : 0.95);
  ctx.beginPath();
  ctx.arc(32, 14, 8, 0, Math.PI * 2);
  ctx.fill();
  // visor / eyes
  ctx.fillStyle = b;
  if (helmet) {
    ctx.fillRect(25, 12, 14, 4);
  } else {
    ctx.fillRect(26, 12, 5, 3);
    ctx.fillRect(34, 12, 5, 3);
  }
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(27, 8, 6, 2);
}

function guardian(ctx: CanvasRenderingContext2D, a: string, b: string): void {
  shadow(ctx, 40);
  // tall statue body
  ctx.fillStyle = shade(a, 0.75);
  ctx.beginPath();
  ctx.moveTo(24, 16); ctx.lineTo(40, 16); ctx.lineTo(46, 56); ctx.lineTo(18, 56);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(a, 1.05);
  ctx.fillRect(26, 20, 12, 4);
  ctx.fillRect(24, 30, 16, 3);
  ctx.fillRect(22, 40, 20, 3);
  // jackal head + ears
  ctx.fillStyle = shade(a, 0.9);
  ctx.beginPath();
  ctx.arc(32, 10, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(26, 6); ctx.lineTo(22, -4); ctx.lineTo(30, 3); ctx.closePath();
  ctx.moveTo(38, 6); ctx.lineTo(42, -4); ctx.lineTo(34, 3); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = b;
  ctx.fillRect(28, 9, 3, 2);
  ctx.fillRect(34, 9, 3, 2);
  // staff + orb
  ctx.strokeStyle = shade(a, 0.5);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(48, 14); ctx.lineTo(48, 56); ctx.stroke();
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.arc(48, 10, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath(); ctx.arc(47, 8, 2, 0, Math.PI * 2); ctx.fill();
}

function drone(ctx: CanvasRenderingContext2D, a: string, b: string): void {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(32, 58, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  // rotor arms
  ctx.strokeStyle = shade(a, 0.6);
  ctx.lineWidth = 3;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    ctx.beginPath(); ctx.moveTo(32, 30); ctx.lineTo(32 + dx * 18, 30 + dy * 10); ctx.stroke();
    ctx.fillStyle = shade(a, 0.9);
    ctx.beginPath(); ctx.arc(32 + dx * 18, 30 + dy * 10, 4, 0, Math.PI * 2); ctx.fill();
  }
  // body
  ctx.fillStyle = shade(a, 0.85);
  ctx.beginPath(); ctx.arc(32, 30, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(a, 0.55);
  ctx.beginPath(); ctx.arc(32, 30, 14, Math.PI * 0.15, Math.PI * 0.85); ctx.fill();
  // eye
  ctx.fillStyle = "#0a0e12";
  ctx.beginPath(); ctx.arc(32, 30, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.arc(32, 30, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath(); ctx.arc(30, 28, 2, 0, Math.PI * 2); ctx.fill();
  // antenna
  ctx.strokeStyle = shade(a, 0.7);
  ctx.beginPath(); ctx.moveTo(32, 16); ctx.lineTo(32, 8); ctx.stroke();
  ctx.fillStyle = b;
  ctx.fillRect(30, 5, 4, 3);
}

function grey(ctx: CanvasRenderingContext2D, a: string, b: string): void {
  shadow(ctx, 22);
  // spindly body
  ctx.fillStyle = shade(a, 0.7);
  ctx.beginPath();
  ctx.moveTo(28, 30); ctx.lineTo(36, 30); ctx.lineTo(38, 52); ctx.lineTo(26, 52);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(a, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(28, 34); ctx.lineTo(20, 46); ctx.moveTo(36, 34); ctx.lineTo(44, 46); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(28, 52); ctx.lineTo(26, 58); ctx.moveTo(36, 52); ctx.lineTo(38, 58); ctx.stroke();
  // huge cranium
  ctx.fillStyle = shade(a, 1.05);
  ctx.beginPath(); ctx.ellipse(32, 18, 14, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(a, 0.85);
  ctx.beginPath(); ctx.ellipse(32, 26, 8, 6, 0, 0, Math.PI); ctx.fill();
  // eyes
  ctx.fillStyle = "#060a08";
  ctx.beginPath(); ctx.ellipse(25, 20, 5, 7, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(39, 20, 5, 7, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = b;
  ctx.fillRect(24, 17, 2, 2);
  ctx.fillRect(38, 17, 2, 2);
}

function reptoid(ctx: CanvasRenderingContext2D, a: string, b: string): void {
  shadow(ctx, 34);
  // tail
  ctx.strokeStyle = shade(a, 0.7);
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(30, 48); ctx.quadraticCurveTo(12, 52, 10, 42); ctx.stroke();
  // legs
  ctx.fillStyle = shade(a, 0.6);
  ctx.fillRect(24, 42, 7, 16);
  ctx.fillRect(35, 42, 7, 16);
  // body
  ctx.fillStyle = shade(a, 0.9);
  ctx.beginPath();
  ctx.moveTo(22, 24); ctx.lineTo(42, 24); ctx.lineTo(44, 46); ctx.lineTo(20, 46);
  ctx.closePath(); ctx.fill();
  // belly plates
  ctx.fillStyle = shade(b, 0.5);
  ctx.fillRect(26, 28, 12, 3);
  ctx.fillRect(25, 34, 14, 3);
  ctx.fillRect(26, 40, 12, 3);
  // back spikes
  ctx.fillStyle = shade(b, 0.8);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(22 + i * 6, 24); ctx.lineTo(25 + i * 6, 17); ctx.lineTo(28 + i * 6, 24);
    ctx.closePath(); ctx.fill();
  }
  // head w/ snout
  ctx.fillStyle = shade(a, 1.05);
  ctx.beginPath();
  ctx.moveTo(24, 10); ctx.lineTo(40, 10); ctx.lineTo(44, 18); ctx.lineTo(38, 24); ctx.lineTo(26, 24); ctx.lineTo(20, 18);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(a, 0.75);
  ctx.fillRect(38, 14, 10, 4);
  // slit eyes
  ctx.fillStyle = b;
  ctx.fillRect(27, 14, 3, 4);
  ctx.fillRect(34, 14, 3, 4);
  ctx.fillStyle = "#0a0e06";
  ctx.fillRect(28, 14, 1, 4);
  ctx.fillRect(35, 14, 1, 4);
  // claws
  ctx.fillStyle = shade(b, 0.9);
  ctx.fillRect(18, 34, 4, 8);
  ctx.fillRect(44, 34, 4, 8);
}

function insectoid(ctx: CanvasRenderingContext2D, a: string, b: string): void {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(32, 56, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
  // legs
  ctx.strokeStyle = shade(a, 0.55);
  ctx.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(32, 38);
      ctx.lineTo(32 + s * (12 + i * 5), 30 + i * 4);
      ctx.lineTo(32 + s * (16 + i * 6), 54);
      ctx.stroke();
    }
  }
  // abdomen
  ctx.fillStyle = shade(a, 0.8);
  ctx.beginPath(); ctx.ellipse(32, 42, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(a, 0.6);
  ctx.beginPath(); ctx.ellipse(32, 45, 9, 5, 0, 0, Math.PI); ctx.fill();
  // thorax / head
  ctx.fillStyle = shade(a, 1.0);
  ctx.beginPath(); ctx.arc(32, 26, 9, 0, Math.PI * 2); ctx.fill();
  // mandibles
  ctx.strokeStyle = shade(b, 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(28, 32, 5, Math.PI * 0.2, Math.PI * 1.1); ctx.stroke();
  ctx.beginPath(); ctx.arc(36, 32, 5, Math.PI * 1.9, Math.PI * 0.8, true); ctx.stroke();
  // eye cluster
  ctx.fillStyle = b;
  for (const [ex, ey] of [[28, 23], [32, 21], [36, 23], [30, 26], [34, 26]] as const) {
    ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  // antennae
  ctx.strokeStyle = shade(a, 0.7);
  ctx.beginPath(); ctx.moveTo(29, 18); ctx.quadraticCurveTo(24, 8, 18, 8); ctx.moveTo(35, 18); ctx.quadraticCurveTo(40, 8, 46, 8); ctx.stroke();
}

function turret(ctx: CanvasRenderingContext2D, a: string, b: string): void {
  shadow(ctx, 30);
  // tripod
  ctx.strokeStyle = shade(a, 0.6);
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(32, 34); ctx.lineTo(16, 58); ctx.moveTo(32, 34); ctx.lineTo(48, 58); ctx.moveTo(32, 34); ctx.lineTo(32, 58); ctx.stroke();
  // body
  ctx.fillStyle = shade(a, 0.9);
  ctx.fillRect(20, 22, 24, 16);
  ctx.fillStyle = shade(a, 0.65);
  ctx.fillRect(20, 32, 24, 6);
  // barrel
  ctx.fillStyle = "#14181c";
  ctx.fillRect(42, 26, 18, 6);
  ctx.fillStyle = b;
  ctx.fillRect(58, 27, 3, 4);
  // sensor
  ctx.fillStyle = "#0a0c10";
  ctx.beginPath(); ctx.arc(32, 18, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.arc(32, 18, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(30, 15, 2, 2);
}

function boss(ctx: CanvasRenderingContext2D, a: string, b: string, size: number): void {
  const s = size / 64;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath(); ctx.ellipse(32, 58, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
  // cape
  ctx.fillStyle = shade(a, 0.4);
  ctx.beginPath();
  ctx.moveTo(18, 20); ctx.lineTo(46, 20); ctx.lineTo(54, 58); ctx.lineTo(10, 58);
  ctx.closePath(); ctx.fill();
  // legs
  ctx.fillStyle = shade(a, 0.55);
  ctx.fillRect(22, 42, 9, 16);
  ctx.fillRect(35, 42, 9, 16);
  // torso armor
  ctx.fillStyle = shade(a, 0.95);
  ctx.beginPath();
  ctx.moveTo(18, 20); ctx.lineTo(46, 20); ctx.lineTo(48, 44); ctx.lineTo(16, 44);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(a, 0.6);
  ctx.fillRect(18, 34, 28, 4);
  // core
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.arc(32, 28, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath(); ctx.arc(30, 26, 2.4, 0, Math.PI * 2); ctx.fill();
  // shoulders + spikes
  ctx.fillStyle = shade(a, 1.15);
  ctx.fillRect(12, 18, 10, 10);
  ctx.fillRect(42, 18, 10, 10);
  ctx.fillStyle = shade(b, 0.8);
  for (const sx of [13, 18, 44, 49]) {
    ctx.beginPath(); ctx.moveTo(sx, 18); ctx.lineTo(sx + 2.5, 10); ctx.lineTo(sx + 5, 18); ctx.closePath(); ctx.fill();
  }
  // horned helm
  ctx.fillStyle = shade(a, 1.05);
  ctx.beginPath(); ctx.arc(32, 10, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(a, 0.7);
  ctx.beginPath();
  ctx.moveTo(24, 5); ctx.lineTo(16, -8); ctx.lineTo(27, 2); ctx.closePath();
  ctx.moveTo(40, 5); ctx.lineTo(48, -8); ctx.lineTo(37, 2); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = b;
  ctx.fillRect(25, 9, 6, 3);
  ctx.fillRect(34, 9, 6, 3);
  // blade arm
  ctx.fillStyle = "#14181c";
  ctx.fillRect(46, 26, 6, 14);
  ctx.fillStyle = shade(b, 0.9);
  ctx.beginPath(); ctx.moveTo(52, 26); ctx.lineTo(62, 22); ctx.lineTo(52, 40); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function prisoner(ctx: CanvasRenderingContext2D): void {
  shadow(ctx, 26);
  // kneeling ragged figure
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(22, 44, 20, 10);
  ctx.fillStyle = "#8a6a42";
  ctx.beginPath();
  ctx.moveTo(24, 28); ctx.lineTo(40, 28); ctx.lineTo(42, 48); ctx.lineTo(22, 48);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#6a5232";
  ctx.fillRect(26, 32, 12, 3);
  ctx.fillRect(24, 38, 14, 2);
  // head, bowed
  ctx.fillStyle = "#c8a882";
  ctx.beginPath(); ctx.arc(32, 22, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4a3a28";
  ctx.beginPath(); ctx.arc(32, 19, 7, Math.PI, Math.PI * 2); ctx.fill();
  // bound wrists
  ctx.fillStyle = "#9aa4ae";
  ctx.fillRect(28, 42, 8, 3);
  // collar light
  ctx.fillStyle = "#3ad8e8";
  ctx.fillRect(29, 27, 6, 2);
}

function crate(ctx: CanvasRenderingContext2D): void {
  shadow(ctx, 30);
  ctx.fillStyle = "#4a5a32";
  ctx.fillRect(14, 28, 36, 26);
  ctx.fillStyle = "#5f7440";
  ctx.fillRect(14, 28, 36, 8);
  ctx.strokeStyle = "#2a341c";
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 28, 36, 26);
  ctx.beginPath(); ctx.moveTo(14, 41); ctx.lineTo(50, 41); ctx.stroke();
  ctx.fillStyle = "#cfe6a0";
  ctx.font = "bold 8px monospace";
  ctx.fillText("IDF", 26, 50);
  ctx.fillStyle = "#8aa050";
  ctx.fillRect(14, 24, 36, 4);
}

function cellsPack(ctx: CanvasRenderingContext2D): void {
  shadow(ctx, 22);
  ctx.fillStyle = "#1a3a24";
  ctx.fillRect(22, 30, 20, 22);
  ctx.fillStyle = "#4ef08a";
  ctx.fillRect(25, 26, 5, 6);
  ctx.fillRect(34, 26, 5, 6);
  ctx.fillStyle = "#2a5a3a";
  ctx.fillRect(24, 34, 16, 14);
  ctx.fillStyle = "#4ef08a";
  ctx.fillRect(27, 38, 10, 2);
  ctx.fillRect(27, 42, 10, 2);
}

function shellsBox(ctx: CanvasRenderingContext2D): void {
  shadow(ctx, 22);
  ctx.fillStyle = "#6a2a22";
  ctx.fillRect(20, 34, 24, 18);
  ctx.strokeStyle = "#3a1610";
  ctx.strokeRect(20, 34, 24, 18);
  ctx.fillStyle = "#e8b23c";
  for (let i = 0; i < 4; i++) ctx.fillRect(23 + i * 5, 28, 3, 8);
  ctx.fillStyle = "#c8503c";
  for (let i = 0; i < 4; i++) ctx.fillRect(23 + i * 5, 26, 3, 3);
}

function medkit(ctx: CanvasRenderingContext2D): void {
  shadow(ctx, 22);
  ctx.fillStyle = "#d8e0e4";
  ctx.fillRect(20, 32, 24, 20);
  ctx.fillStyle = "#aab8c0";
  ctx.fillRect(20, 32, 24, 5);
  ctx.fillStyle = "#37c878";
  ctx.fillRect(29, 37, 6, 12);
  ctx.fillRect(25, 41, 14, 4);
}

function energyCell(ctx: CanvasRenderingContext2D): void {
  shadow(ctx, 18);
  ctx.fillStyle = "#0e3a44";
  ctx.beginPath();
  ctx.moveTo(32, 24); ctx.lineTo(44, 31); ctx.lineTo(44, 45); ctx.lineTo(32, 52); ctx.lineTo(20, 45); ctx.lineTo(20, 31);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#3ad8e8";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#3ad8e8";
  ctx.beginPath();
  ctx.moveTo(33, 30); ctx.lineTo(27, 40); ctx.lineTo(31, 40); ctx.lineTo(29, 47); ctx.lineTo(37, 36); ctx.lineTo(33, 36);
  ctx.closePath(); ctx.fill();
}

function creditChip(ctx: CanvasRenderingContext2D): void {
  shadow(ctx, 18);
  ctx.fillStyle = "#8a6a1a";
  ctx.beginPath(); ctx.arc(32, 40, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e8c23c";
  ctx.beginPath(); ctx.arc(32, 38, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8a6a1a";
  ctx.beginPath(); ctx.arc(32, 38, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffe98a";
  ctx.fillRect(30, 33, 4, 10);
  ctx.fillRect(27, 36, 10, 4);
}

function artifact(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(70,232,216,0.18)";
  ctx.beginPath(); ctx.arc(32, 36, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1a5a52";
  ctx.beginPath();
  ctx.moveTo(32, 18); ctx.lineTo(46, 46); ctx.lineTo(18, 46);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#46e8d8";
  ctx.beginPath();
  ctx.moveTo(32, 24); ctx.lineTo(41, 43); ctx.lineTo(23, 43);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.moveTo(32, 27); ctx.lineTo(36, 40); ctx.lineTo(30, 40);
  ctx.closePath(); ctx.fill();
}

function trapPlate(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#14181c";
  ctx.fillRect(8, 44, 48, 14);
  ctx.strokeStyle = "#2a3238";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 44, 48, 14);
  ctx.fillStyle = "#e8a020";
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(12 + i * 12, 56); ctx.lineTo(18 + i * 12, 46); ctx.lineTo(24 + i * 12, 56);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "#ff4655";
  ctx.fillRect(30, 40, 4, 4);
}

export function getSprite(key: string, a: string, b: string): HTMLCanvasElement {
  const ck = `${key}|${a}|${b}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const [c, ctx] = key === "boss" ? mk(96) : mk(SPR);
  ctx.imageSmoothingEnabled = false;
  switch (key) {
    case "humanoid": humanoid(ctx, a, b); break;
    case "clone": humanoid(ctx, a, b, true); break;
    case "synth": humanoid(ctx, a, b, true); break;
    case "guardian": guardian(ctx, a, b); break;
    case "drone": drone(ctx, a, b); break;
    case "grey": grey(ctx, a, b); break;
    case "reptoid": reptoid(ctx, a, b); break;
    case "insectoid": insectoid(ctx, a, b); break;
    case "turret": turret(ctx, a, b); break;
    case "boss": boss(ctx, a, b, 96); break;
    case "prisoner": prisoner(ctx); break;
    case "crate": crate(ctx); break;
    case "cells": cellsPack(ctx); break;
    case "shells": shellsBox(ctx); break;
    case "medkit": medkit(ctx); break;
    case "energy": energyCell(ctx); break;
    case "credits": creditChip(ctx); break;
    case "artifact": artifact(ctx); break;
    case "trap": trapPlate(ctx); break;
    default: humanoid(ctx, a, b);
  }
  cache.set(ck, c);
  return c;
}
