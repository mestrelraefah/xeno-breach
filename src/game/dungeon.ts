// ============ Procedural sector generation ============

export const T_FLOOR = 0;
export const T_WALL = 1;
export const T_ACCENT = 2;
export const T_DOOR = 3;
export const T_LOCKED = 4;

export type EntKind = "enemy" | "pickup" | "trap" | "prisoner" | "portal";
export type PickupKind = "cells" | "shells" | "medkit" | "energy" | "credits" | "artifact";

export interface Ent {
  kind: EntKind;
  defId: string;       // enemy id or pickup kind or prisoner class
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cd: number;
  stun: number;
  elite: boolean;
  alert: boolean;
  dead: boolean;
  seed: number;
  locked: boolean;     // portal lock state
  value: number;
}

export interface Dungeon {
  W: number;
  H: number;
  cells: Uint8Array;
  explored: Uint8Array;
  startX: number;
  startY: number;
  startAng: number;
  exitX: number;
  exitY: number;
  ents: Ent[];
  bossDepth: boolean;
}

interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function ri(a: number, b: number): number {
  return Math.floor(rnd(a, b + 1));
}

export function generateDungeon(depth: number, pool: string[], bossDepth: boolean): Dungeon {
  const W = Math.min(44, 26 + depth * 2);
  const H = Math.min(44, 26 + depth * 2);
  const cells = new Uint8Array(W * H).fill(T_WALL);
  const idx = (x: number, y: number) => y * W + x;

  // --- rooms ---
  const rooms: Room[] = [];
  const target = Math.min(26, 13 + depth * 2);
  for (let tries = 0; tries < 260 && rooms.length < target; tries++) {
    const w = ri(4, 8);
    const h = ri(4, 8);
    const x = ri(1, W - w - 2);
    const y = ri(1, H - h - 2);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) cells[idx(xx, yy)] = T_FLOOR;
  }
  if (rooms.length < 4) {
    // fallback: carve a big hall so the run is always playable
    rooms.push({ x: 2, y: 2, w: 8, h: 8, cx: 6, cy: 6 });
    rooms.push({ x: W - 12, y: H - 12, w: 8, h: 8, cx: W - 8, cy: H - 8 });
    for (const r of rooms)
      for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) cells[idx(xx, yy)] = T_FLOOR;
  }

  // --- corridors (connect sequential + a few loops) ---
  const carve = (x: number, y: number) => {
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && cells[idx(x, y)] !== T_FLOOR) cells[idx(x, y)] = T_FLOOR;
  };
  const corridor = (a: Room, b: Room) => {
    let x = a.cx;
    let y = a.cy;
    const horizFirst = Math.random() < 0.5;
    const step = () => {
      carve(x, y);
      carve(x, y + 1); // wider corridors feel better in first person
    };
    if (horizFirst) {
      while (x !== b.cx) { x += Math.sign(b.cx - x); step(); }
      while (y !== b.cy) { y += Math.sign(b.cy - y); step(); }
    } else {
      while (y !== b.cy) { y += Math.sign(b.cy - y); step(); }
      while (x !== b.cx) { x += Math.sign(b.cx - x); step(); }
    }
    carve(b.cx, b.cy);
  };
  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i]);
  const loops = Math.min(5, Math.floor(rooms.length / 4));
  for (let i = 0; i < loops; i++) corridor(rooms[ri(0, rooms.length - 1)], rooms[ri(0, rooms.length - 1)]);

  // --- accent trim: wall tiles adjacent to floor, randomly ---
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      if (cells[idx(x, y)] === T_WALL) {
        const near =
          cells[idx(x - 1, y)] === T_FLOOR || cells[idx(x + 1, y)] === T_FLOOR ||
          cells[idx(x, y - 1)] === T_FLOOR || cells[idx(x, y + 1)] === T_FLOOR;
        if (near && Math.random() < 0.28) cells[idx(x, y)] = T_ACCENT;
      }

  // --- BFS distances from start room ---
  const start = rooms[0];
  const dist = new Int32Array(W * H).fill(-1);
  const q: number[] = [idx(start.cx, start.cy)];
  dist[q[0]] = 0;
  for (let head = 0; head < q.length; head++) {
    const c = q[head];
    const cx = c % W;
    const cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = idx(nx, ny);
      if (cells[ni] === T_FLOOR && dist[ni] < 0) {
        dist[ni] = dist[c] + 1;
        q.push(ni);
      }
    }
  }

  // exit = center of the farthest reachable room (always an open chamber)
  let exitI = idx(start.cx, start.cy);
  for (let k = 1; k < rooms.length; k++) {
    const r = rooms[k];
    const ci = idx(r.cx, r.cy);
    if (dist[ci] > dist[exitI]) exitI = ci;
  }
  const exitX = (exitI % W) + 0.5;
  const exitY = ((exitI / W) | 0) + 0.5;

  // --- doors: floor tiles pinched between walls orthogonally ---
  const doorCandidates: number[] = [];
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const i = idx(x, y);
      if (cells[i] !== T_FLOOR) continue;
      if (x === start.cx && y === start.cy) continue;
      if (i === exitI) continue;
      const hPinch = cells[idx(x - 1, y)] > 0 && cells[idx(x + 1, y)] > 0 && cells[idx(x, y - 1)] === 0 && cells[idx(x, y + 1)] === 0;
      const vPinch = cells[idx(x, y - 1)] > 0 && cells[idx(x, y + 1)] > 0 && cells[idx(x - 1, y)] === 0 && cells[idx(x + 1, y)] === 0;
      if ((hPinch || vPinch) && dist[i] > 6 && Math.random() < 0.3) doorCandidates.push(i);
    }
  for (const i of doorCandidates) {
    const dv = Math.random() < Math.min(0.4, 0.12 + depth * 0.04) ? T_LOCKED : T_DOOR;
    cells[i] = dv;
    // corridors are 2-wide: seal the parallel tile too when applicable
    const x = i % W;
    const y = (i / W) | 0;
    for (const [ox, oy] of [[0, 1], [1, 0]] as const) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx >= W - 1 || ny >= H - 1) continue;
      const ni = idx(nx, ny);
      if (
        cells[ni] === T_FLOOR && ni !== exitI && dist[ni] > 6 &&
        !(nx === start.cx && ny === start.cy) && Math.random() < 0.85
      ) {
        cells[ni] = dv;
      }
    }
  }

  // --- populate entities ---
  const ents: Ent[] = [];
  const scaleHp = 1 + 0.22 * (depth - 1);
  const floorTiles: number[] = [];
  for (let i = 0; i < dist.length; i++) if (dist[i] > 4 && cells[i] === T_FLOOR && i !== exitI) floorTiles.push(i);
  const shuffled = floorTiles.sort(() => Math.random() - 0.5);
  let cursor = 0;
  const takeTile = (minDist: number): { x: number; y: number } | null => {
    while (cursor < shuffled.length) {
      const i = shuffled[cursor++];
      if (dist[i] >= minDist) return { x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 };
    }
    return null;
  };

  const mkEnemy = (defId: string, x: number, y: number, elite: boolean): Ent => {
    const mult = elite ? 1.9 : 1;
    const hp = Math.round(30 * scaleHp * mult * (0.85 + Math.random() * 0.3));
    return { kind: "enemy", defId, x, y, hp: Math.max(10, hp), maxHp: Math.max(10, hp), cd: rnd(0.3, 1.2), stun: 0, elite, alert: false, dead: false, seed: Math.random() * 1000, locked: false, value: 0 };
  };

  // enemies
  const nEnemies = Math.min(42, 9 + depth * 4 + ri(0, 3));
  const eliteChance = Math.min(0.24, 0.05 + depth * 0.025);
  for (let n = 0; n < nEnemies; n++) {
    const t = takeTile(7);
    if (!t) break;
    const defId = pool[ri(0, pool.length - 1)];
    ents.push(mkEnemy(defId, t.x, t.y, Math.random() < eliteChance));
  }

  // turrets near doors
  const nTurrets = Math.min(6, 1 + Math.floor(depth / 2));
  for (let n = 0; n < nTurrets; n++) {
    const t = takeTile(9);
    if (!t) break;
    ents.push(mkEnemy("turret", t.x, t.y, false));
  }

  // boss on boss depths
  if (bossDepth) {
    const bx = exitX;
    const by = exitY;
    const boss = mkEnemy("boss", bx, by, false);
    boss.hp = Math.round(700 + 350 * (depth / 6 - 1));
    boss.maxHp = boss.hp;
    // keep boss just off the portal tile
    boss.y = Math.max(1.5, by - 1.2);
    ents.push(boss);
    // honor guard
    ents.push(mkEnemy(pool[ri(0, pool.length - 1)], Math.max(1.5, bx - 1.5), boss.y, true));
    ents.push(mkEnemy(pool[ri(0, pool.length - 1)], Math.min(W - 1.5, bx + 1.5), boss.y, true));
  }

  // pickups
  const pickups: { kind: PickupKind; w: number }[] = [
    { kind: "cells", w: 5 }, { kind: "shells", w: 3 }, { kind: "medkit", w: 3 },
    { kind: "energy", w: 3 }, { kind: "credits", w: 4 }, { kind: "artifact", w: 1 },
  ];
  const nPickups = Math.min(16, 7 + depth);
  for (let n = 0; n < nPickups; n++) {
    const t = takeTile(5);
    if (!t) break;
    let roll = Math.random() * 19;
    let kind: PickupKind = "cells";
    for (const p of pickups) { roll -= p.w; if (roll <= 0) { kind = p.kind; break; } }
    ents.push({ kind: "pickup", defId: kind, x: t.x, y: t.y, hp: 1, maxHp: 1, cd: 0, stun: 0, elite: false, alert: false, dead: false, seed: Math.random() * 1000, locked: false, value: 0 });
  }

  // traps
  const nTraps = Math.min(10, 2 + depth);
  for (let n = 0; n < nTraps; n++) {
    const t = takeTile(6);
    if (!t) break;
    ents.push({ kind: "trap", defId: "spikes", x: t.x, y: t.y, hp: 1, maxHp: 1, cd: 0, stun: 0, elite: false, alert: false, dead: false, seed: Math.random() * 1000, locked: false, value: 0 });
  }

  // prisoners (abductees who can join the squad)
  const nPrisoners = depth >= 2 ? (Math.random() < 0.75 ? 1 : 2) : Math.random() < 0.4 ? 1 : 0;
  const classes = ["vanguard", "medic", "breacher", "tech"];
  for (let n = 0; n < nPrisoners; n++) {
    const t = takeTile(10);
    if (!t) break;
    ents.push({ kind: "prisoner", defId: classes[ri(0, 3)], x: t.x, y: t.y, hp: 1, maxHp: 1, cd: 0, stun: 0, elite: false, alert: false, dead: false, seed: Math.random() * 1000, locked: false, value: 0 });
  }

  // exit portal
  ents.push({ kind: "portal", defId: "portal", x: exitX, y: exitY, hp: 1, maxHp: 1, cd: 0, stun: 0, elite: false, alert: false, dead: false, seed: 0, locked: bossDepth, value: 0 });

  return {
    W, H, cells, explored: new Uint8Array(W * H),
    startX: start.cx + 0.5, startY: start.cy + 0.5,
    startAng: Math.atan2(exitY - (start.cy + 0.5), exitX - (start.cx + 0.5)),
    exitX, exitY, ents, bossDepth,
  };
}
