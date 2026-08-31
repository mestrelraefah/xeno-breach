// ============ XENOBREACH engine — raycaster, combat, automap ============

import {
  AGENTS, ENEMIES, FACTIONS, factionForDepth, isBossDepth,
  saveMeta, upgradeRank,
} from "./data";
import type { AgentDef, MetaSave, RunSummary } from "./data";
import { generateDungeon, T_DOOR, T_LOCKED } from "./dungeon";
import type { Dungeon, Ent } from "./dungeon";
import { getSprite, SPR } from "./sprites";
import { sfx } from "./audio";

export const VW = 768;
export const VH = 432;
const PLANE = 0.72;
const WALL_H = 15; // fog distance

export interface AgentState {
  def: AgentDef;
  hp: number;
  maxHp: number;
  energy: number;
  ammo: number;
  alive: boolean;
  weaponCd: number;
  specialCd: number;
}

export interface HudAgent {
  name: string; role: string; color: string;
  hp: number; maxHp: number; energy: number;
  ammo: number; ammoLabel: string; alive: boolean; active: boolean;
  specialName: string; specialEnergy: number;
}

export interface HudSnapshot {
  depth: number;
  faction: string;
  factionSub: string;
  accent: string;
  credits: number;
  runCredits: number;
  kills: number;
  timeSec: number;
  objective: string;
  mapPct: number;
  revealT: number;
  empT: number;
  agents: HudAgent[];
  boss: { name: string; hp: number; maxHp: number } | null;
  weaponName: string;
  specialHint: string;
  state: string;
}

interface Particle {
  kind: "spark" | "ring";
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  color: string; size: number; radius: number; grow: number;
}

interface Msg { text: string; color: string; t: number }

export interface EngineCallbacks {
  onEnd: (s: RunSummary) => void;
  onPauseToggle: (paused: boolean) => void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Game {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mini: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private big: HTMLCanvasElement | null;
  private bctx: CanvasRenderingContext2D | null;
  private cb: EngineCallbacks;

  state: "idle" | "playing" | "paused" | "over" | "cleared" = "idle";
  bigMapOpen = false;

  private meta!: MetaSave;
  private d!: Dungeon;
  depth = 0;
  private squad: AgentState[] = [];
  private active = 0;
  private px = 2; private py = 2; private ang = 0;
  private keys = new Set<string>();
  private mouseDown = false;
  private dragging = false;
  private lastMX = 0;
  private walkT = 0;
  private moving = false;

  private recoil = 0;
  private muzzle = 0;
  private knifeSwing = 0;
  private hitFlash = 0;
  private empFlash = 0;
  private greenFlash = 0;
  private shake = 0;
  private hitMarker = 0;
  private sweep = 0;
  private time = 0;
  private runTime = 0;

  private empT = 0;
  private revealT = 0;
  private alarmDone = false;
  private exitSeen = false;
  private prompt = "";
  private promptT = 0;

  private kills = 0;
  private runCredits = 0;
  private rescued = 0;

  private particles: Particle[] = [];
  private msgs: Msg[] = [];
  private zbuf = new Float32Array(VW);
  private portalCv: HTMLCanvasElement;

  private raf = 0;
  private lastT = 0;
  private destroyed = false;

  private onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onCtx = (e: Event) => e.preventDefault();
  private onBlur = () => { if (this.state === "playing") this.togglePause(); };

  constructor(canvas: HTMLCanvasElement, mini: HTMLCanvasElement, big: HTMLCanvasElement | null, cb: EngineCallbacks) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.mini = mini;
    this.mctx = mini.getContext("2d")!;
    this.big = big;
    this.bctx = big ? big.getContext("2d")! : null;
    this.cb = cb;
    this.cv.width = VW;
    this.cv.height = VH;
    this.portalCv = document.createElement("canvas");
    this.portalCv.width = 96;
    this.portalCv.height = 96;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("contextmenu", this.onCtx);
    canvas.addEventListener("mousedown", (e) => {
      sfx.unlock();
      if (this.state !== "playing") return;
      if (e.button === 0) {
        this.mouseDown = true;
        if (document.pointerLockElement !== canvas) {
          try {
            const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            if (p && typeof p.catch === "function") p.catch(() => undefined);
          } catch { /* iframe sandbox */ }
          this.dragging = true;
          this.lastMX = e.clientX;
        }
        this.fire();
      } else if (e.button === 2) {
        this.useSpecial();
      }
    });
    window.addEventListener("mouseup", () => { this.mouseDown = false; this.dragging = false; });
    window.addEventListener("mousemove", (e) => {
      if (this.state !== "playing") return;
      if (document.pointerLockElement === canvas) {
        this.ang += e.movementX * 0.0028;
      } else if (this.dragging) {
        this.ang += (e.clientX - this.lastMX) * 0.0045;
        this.lastMX = e.clientX;
      }
    });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas) this.dragging = false;
    });

    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.destroyed) return;
      const dt = clamp((t - this.lastT) / 1000, 0, 0.05);
      this.lastT = t;
      this.time += dt;
      if (this.state === "playing") {
        this.update(dt);
      }
      this.tickFx(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  // ---------------- run control ----------------

  startRun(meta: MetaSave): void {
    this.meta = { ...meta, upgrades: { ...meta.upgrades } };
    this.meta.runs += 1;
    this.kills = 0; this.runCredits = 0; this.rescued = 0; this.runTime = 0;
    this.squad = AGENTS.map((def) => this.mkAgent(def));
    this.active = 0;
    this.depth = 1;
    this.genDepth();
    this.state = "playing";
    sfx.unlock();
    sfx.deploy();
    sfx.ambientStart();
    this.msg(`INSERTION COMPLETE — ${this.faction().label}`, "#4ef08a");
    this.msg("OBJECTIVE: LOCATE THE EXTRACTION GATE", "#ffb03a");
    saveMeta(this.meta);
  }

  private mkAgent(def: AgentDef): AgentState {
    const vit = upgradeRank(this.meta, "vitality");
    const log = upgradeRank(this.meta, "logistics");
    const maxHp = def.maxHp + vit * 15;
    let ammo = 0;
    if (def.weapon.ammo === "cells") ammo = Math.round((def.id === "vanguard" ? 90 : 45) * (1 + 0.2 * log));
    if (def.weapon.ammo === "shells") ammo = Math.round(26 * (1 + 0.2 * log));
    return { def, hp: maxHp, maxHp, energy: 100, ammo, alive: true, weaponCd: 0, specialCd: 0 };
  }

  private faction() { return factionForDepth(this.depth); }

  private genDepth(): void {
    const f = this.faction();
    this.d = generateDungeon(this.depth, f.pool, isBossDepth(this.depth));
    this.px = this.d.startX; this.py = this.d.startY; this.ang = this.d.startAng;
    this.alarmDone = false; this.exitSeen = false;
    this.empT = 0; this.revealT = 0;
    this.particles = [];
    this.reveal(4.5 + upgradeRank(this.meta, "carto") * 2.5);
    for (const a of this.squad) { a.weaponCd = 0; a.specialCd = 0; }
  }

  nextDepth(): void {
    this.depth += 1;
    this.genDepth();
    for (const a of this.squad) {
      if (!a.alive) continue;
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.3);
      a.energy = 100;
    }
    const v = this.squad[0]; const m = this.squad[1]; const b = this.squad[2];
    if (v && v.def.weapon.ammo === "cells") v.ammo += 50;
    if (m && m.def.weapon.ammo === "cells") m.ammo += 30;
    if (b && b.def.weapon.ammo === "shells") b.ammo += 12;
    this.state = "playing";
    sfx.deploy();
    this.msg(`BREACHED SECTOR ${this.depth} — ${this.faction().label}`, "#4ef08a");
    this.msg("RESUPPLY DROP RECEIVED", "#3ad8e8");
  }

  togglePause(): void {
    if (this.state === "playing") {
      this.state = "paused";
      this.cb.onPauseToggle(true);
    } else if (this.state === "paused") {
      this.state = "playing";
      this.lastT = performance.now();
      this.cb.onPauseToggle(false);
    }
  }

  abandon(): void {
    if (this.state === "over" || this.state === "idle") return;
    this.endRun(false, true);
  }

  private endRun(victory: boolean, abandon: boolean): void {
    this.meta.credits += this.runCredits;
    this.meta.kills += this.kills;
    this.meta.rescued += this.rescued;
    this.meta.bestDepth = Math.max(this.meta.bestDepth, this.depth);
    if (victory) this.meta.wins += 1;
    saveMeta(this.meta);
    this.state = victory ? "cleared" : "over";
    if (!abandon && !victory) sfx.defeat();
    sfx.ambientStop();
    const summary: RunSummary = {
      victory, abandon,
      depth: this.depth,
      kills: this.kills,
      creditsEarned: this.runCredits,
      rescued: this.rescued,
      timeSec: Math.round(this.runTime),
      faction: this.faction().label,
    };
    this.runCredits = 0;
    this.kills = 0;
    this.rescued = 0;
    this.cb.onEnd(summary);
  }

  // ---------------- input ----------------

  private keyDown(e: KeyboardEvent): void {
    const c = e.code;
    if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
    sfx.unlock();
    if (c === "Escape" || c === "KeyP") {
      if (this.state === "playing" || this.state === "paused") this.togglePause();
      return;
    }
    if (this.state !== "playing") return;
    this.keys.add(c);
    if (c === "Tab" || c === "KeyM") { this.bigMapOpen = !this.bigMapOpen; sfx.ui(); }
    if (c === "Space") this.fire();
    if (c === "KeyE") this.interact();
    if (c === "KeyR") this.useSpecial();
    if (c.startsWith("Digit")) {
      const n = parseInt(c.slice(5), 10) - 1;
      if (n >= 0 && n < this.squad.length && this.squad[n].alive && n !== this.active) {
        this.active = n;
        sfx.ui();
        this.msg(`COMMAND → ${this.squad[n].def.role}`, this.squad[n].def.color);
      }
    }
  }

  private releaseFireKeys(): boolean { return this.keys.has("Space") || this.mouseDown; }

  // ---------------- world queries ----------------

  private cell(x: number, y: number): number {
    const d = this.d;
    const ix = x | 0, iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= d.W || iy >= d.H) return 1;
    return d.cells[iy * d.W + ix];
  }
  private solid(x: number, y: number): boolean { return this.cell(x, y) > 0; }
  private blocked(x: number, y: number, r: number): boolean {
    return this.solid(x - r, y - r) || this.solid(x + r, y - r) || this.solid(x - r, y + r) || this.solid(x + r, y + r);
  }

  private cast(ox: number, oy: number, dx: number, dy: number, max = 40): { dist: number; side: number; tile: number; wallX: number } {
    const d = this.d;
    let mapX = ox | 0, mapY = oy | 0;
    const dDX = Math.abs(1 / (dx || 1e-9)), dDY = Math.abs(1 / (dy || 1e-9));
    let stepX: number, sdx: number, stepY: number, sdy: number;
    if (dx < 0) { stepX = -1; sdx = (ox - mapX) * dDX; } else { stepX = 1; sdx = (mapX + 1 - ox) * dDX; }
    if (dy < 0) { stepY = -1; sdy = (oy - mapY) * dDY; } else { stepY = 1; sdy = (mapY + 1 - oy) * dDY; }
    let side = 0;
    for (let i = 0; i < 200; i++) {
      if (sdx < sdy) { sdx += dDX; mapX += stepX; side = 0; } else { sdy += dDY; mapY += stepY; side = 1; }
      if (mapX < 0 || mapY < 0 || mapX >= d.W || mapY >= d.H) return { dist: max, side, tile: 1, wallX: 0 };
      const t = d.cells[mapY * d.W + mapX];
      if (t > 0) {
        const dist = side === 0 ? sdx - dDX : sdy - dDY;
        let wallX = side === 0 ? oy + dist * dy : ox + dist * dx;
        wallX -= Math.floor(wallX);
        return { dist: Math.max(0.01, dist), side, tile: t, wallX };
      }
    }
    return { dist: max, side: 0, tile: 0, wallX: 0 };
  }

  private los(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return true;
    const hit = this.cast(x0, y0, dx / len, dy / len, len + 0.5);
    return hit.dist >= len - 0.05;
  }

  private reveal(r: number): void {
    const d = this.d;
    const cx = this.px | 0, cy = this.py | 0;
    const rr = Math.ceil(r);
    for (let y = Math.max(0, cy - rr); y <= Math.min(d.H - 1, cy + rr); y++)
      for (let x = Math.max(0, cx - rr); x <= Math.min(d.W - 1, cx + rr); x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) d.explored[y * d.W + x] = 1;
    // exit discovered?
    if (!this.exitSeen) {
      const ex = this.d.exitX | 0, ey = this.d.exitY | 0;
      if ((ex - cx) * (ex - cx) + (ey - cy) * (ey - cy) <= (r + 2) * (r + 2)) {
        this.exitSeen = true;
        this.msg("EXTRACTION GATE LOCATED — MARKED ON MAP", "#5ff2c0");
        sfx.pickup("energy");
      }
    }
  }

  // ---------------- update ----------------

  private update(dt: number): void {
    this.runTime += dt;
    const a = this.squad[this.active];

    // turning (keyboard)
    let tv = 0;
    if (this.keys.has("ArrowLeft")) tv -= 1;
    if (this.keys.has("ArrowRight")) tv += 1;
    this.ang += tv * 2.7 * dt;

    // movement
    let mx = 0, my = 0;
    const cos = Math.cos(this.ang), sin = Math.sin(this.ang);
    const fw = (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) - (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const st = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    mx += cos * fw - sin * st;
    my += sin * fw + cos * st;
    const ml = Math.hypot(mx, my);
    this.moving = ml > 0.01;
    if (this.moving) {
      mx = (mx / ml) * 3.5 * dt;
      my = (my / ml) * 3.5 * dt;
      const r = 0.26;
      if (!this.blocked(this.px + mx, this.py, r)) this.px += mx;
      if (!this.blocked(this.px, this.py + my, r)) this.py += my;
      this.walkT += dt * 9;
    }
    this.reveal(4.5);

    // energy + cooldowns
    const regen = 8 * (1 + 0.18 * upgradeRank(this.meta, "capacitors"));
    for (const ag of this.squad) {
      if (!ag.alive) continue;
      ag.energy = Math.min(100, ag.energy + regen * dt);
      ag.weaponCd = Math.max(0, ag.weaponCd - dt);
      ag.specialCd = Math.max(0, ag.specialCd - dt);
    }

    // autofire
    if (this.releaseFireKeys() && a.def.weapon.auto) this.fire();

    // timers
    this.empT = Math.max(0, this.empT - dt);
    this.revealT = Math.max(0, this.revealT - dt);
    this.promptT = Math.max(0, this.promptT - dt);
    if (this.promptT <= 0) this.prompt = "";

    // pickups + traps
    for (const e of this.d.ents) {
      if (e.dead) continue;
      const dx = e.x - this.px, dy = e.y - this.py;
      const dist = Math.hypot(dx, dy);
      if (e.kind === "pickup" && dist < 0.62) this.collect(e);
      else if (e.kind === "trap" && dist < 0.45) this.triggerTrap(e);
    }

    // portal prompt + proximity
    const portal = this.d.ents.find((e) => e.kind === "portal");
    if (portal) {
      const pd = Math.hypot(portal.x - this.px, portal.y - this.py);
      if (pd < 2.2) {
        if (portal.locked) this.setPrompt("[E] GATE SEALED — ELIMINATE THE ASCENDANT");
        else this.setPrompt("[E] EXTRACT FROM SECTOR");
      }
    }

    // door prompts
    this.updateDoorPrompt();

    // enemies
    this.updateEnemies(dt);

    // boss bar handled in snapshot
  }

  private setPrompt(t: string): void { this.prompt = t; this.promptT = 0.3; }

  private updateDoorPrompt(): void {
    const fx = this.px + Math.cos(this.ang) * 1.15;
    const fy = this.py + Math.sin(this.ang) * 1.15;
    const t = this.cell(fx, fy);
    if (t === T_DOOR) this.setPrompt("[E] BREACH DOOR");
    else if (t === T_LOCKED) {
      const hasTech = this.squad.some((s) => s.alive && s.def.id === "tech");
      this.setPrompt(hasTech ? "[E] BYPASS SECURITY SEAL" : "[E] SEALED — NEEDS TECH SPECIALIST");
    }
    // prisoner prompt
    for (const e of this.d.ents) {
      if (e.kind === "prisoner" && !e.dead && Math.hypot(e.x - this.px, e.y - this.py) < 1.7) {
        this.setPrompt("[E] FREE THE ABDUCTEE");
        break;
      }
    }
  }

  private updateEnemies(dt: number): void {
    const dmgMul = 1 - 0.07 * upgradeRank(this.meta, "plating");
    for (const e of this.d.ents) {
      if (e.kind !== "enemy" || e.dead) continue;
      const def = ENEMIES[e.defId];
      const dx = this.px - e.x, dy = this.py - e.y;
      const dist = Math.hypot(dx, dy);

      if (!e.alert) {
        const aggro = def.ranged ? 9.5 : 7.5;
        if (dist < aggro && this.los(e.x, e.y, this.px, this.py)) {
          e.alert = true;
          if (!this.alarmDone) {
            this.alarmDone = true;
            this.msg("!! HOSTILES ALERTED !!", "#ff4655");
            sfx.alarm();
          }
        }
        continue;
      }

      if (e.stun > 0) { e.stun -= dt; e.cd = Math.max(e.cd, 0.4); continue; }
      e.cd -= dt;

      const meleeRange = 0.85 * def.scale + 0.3;

      if (def.ranged) {
        if (dist <= def.range && dist > 1.6 && e.cd <= 0 && this.los(e.x, e.y, this.px, this.py)) {
          e.cd = def.rof * (0.75 + Math.random() * 0.5);
          sfx.enemyShot();
          this.spawnSparks(e.x + dx * 0.2, e.y + dy * 0.2, 0.55, def.b, 3, 1.2);
          this.damagePlayer(def.dmg * (e.elite ? 1.5 : 1) * dmgMul, def.name);
          continue;
        }
      } else if (dist <= meleeRange) {
        if (e.cd <= 0) {
          e.cd = 1.0;
          this.spawnSparks(this.px, this.py, 0.5, "#ff4655", 6, 2);
          this.damagePlayer(def.dmg * (e.elite ? 1.5 : 1) * dmgMul, def.name);
        }
        continue;
      }

      // approach
      if (def.speed > 0 && (dist > (def.ranged ? def.range * 0.55 : meleeRange * 0.8))) {
        const spd = def.speed * (e.elite ? 1.12 : 1) * dt;
        const nx = dx / dist, ny = dy / dist;
        const r = 0.3 * def.scale;
        if (!this.blocked(e.x + nx * spd, e.y, r)) e.x += nx * spd;
        if (!this.blocked(e.x, e.y + ny * spd, r)) e.y += ny * spd;
      }
    }
  }

  // ---------------- combat ----------------

  private fire(): void {
    if (this.state !== "playing") return;
    const a = this.squad[this.active];
    if (!a.alive || a.weaponCd > 0) return;
    const w = a.def.weapon;
    const hasResource = w.ammo === "energy" ? a.energy >= w.cost : a.ammo > 0;

    if (!hasResource) {
      // combat knife fallback — never soft-lock
      a.weaponCd = 0.42;
      this.knifeSwing = 0.25;
      sfx.shoot("knife");
      this.recoil = Math.max(this.recoil, 0.4);
      let best: Ent | null = null; let bestT = 1.7;
      for (const e of this.d.ents) {
        if (e.kind !== "enemy" || e.dead) continue;
        const t = this.angleTo(e);
        if (t.dist < bestT && t.angDiff < 0.8) { best = e; bestT = t.dist; }
      }
      if (best) this.hurtEnemy(best, 22, bestT);
      return;
    }

    if (w.ammo === "energy") a.energy -= w.cost;
    else a.ammo -= 1;
    a.weaponCd = w.rof;
    this.recoil = 1;
    this.muzzle = 0.07;
    sfx.shoot(w.sfx);

    const dmgMul = 1 + 0.08 * upgradeRank(this.meta, "firepower");
    const wallHit = this.cast(this.px, this.py, Math.cos(this.ang), Math.sin(this.ang));

    for (let p = 0; p < w.pellets; p++) {
      const spread = (Math.random() - 0.5) * 2 * w.spread * (w.pellets > 1 ? 2.2 : 1);
      const pa = this.ang + spread;
      const cx = Math.cos(pa), cy = Math.sin(pa);
      let best: Ent | null = null;
      let bestT = wallHit.dist;
      for (const e of this.d.ents) {
        if (e.kind !== "enemy" || e.dead) continue;
        const dx = e.x - this.px, dy = e.y - this.py;
        const t = dx * cx + dy * cy;
        if (t < 0.2 || t > bestT) continue;
        const perp = Math.abs(dx * cy - dy * cx);
        if (perp < 0.44 * (ENEMIES[e.defId]?.scale ?? 1) + 0.08) { best = e; bestT = t; }
      }
      if (best) {
        let dmg = w.dmg * dmgMul;
        if (w.pellets > 1) dmg *= clamp(1.25 - bestT / w.range, 0.35, 1);
        this.hurtEnemy(best, dmg, bestT);
        // arc chain
        if (w.chain) {
          let from = best;
          let f = 0.7;
          for (let cI = 0; cI < w.chain; cI++) {
            let next: Ent | null = null; let nd = 2.8;
            for (const e2 of this.d.ents) {
              if (e2.kind !== "enemy" || e2.dead || e2 === from || e2 === best) continue;
              const dd = Math.hypot(e2.x - from.x, e2.y - from.y);
              if (dd < nd) { nd = dd; next = e2; }
            }
            if (!next) break;
            this.spawnSparks(next.x, next.y, 0.55, "#9bd1ff", 4, 2);
            this.hurtEnemy(next, w.dmg * dmgMul * f, nd);
            from = next;
            f *= 0.7;
          }
        }
      } else {
        // wall impact sparks
        const hx = this.px + cx * (wallHit.dist - 0.1);
        const hy = this.py + cy * (wallHit.dist - 0.1);
        this.spawnSparks(hx, hy, 0.5, "#ffd27a", 3, 1.6);
      }
    }
  }

  private angleTo(e: Ent): { dist: number; angDiff: number } {
    const dx = e.x - this.px, dy = e.y - this.py;
    const dist = Math.hypot(dx, dy);
    let da = Math.atan2(dy, dx) - this.ang;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return { dist, angDiff: Math.abs(da) };
  }

  private hurtEnemy(e: Ent, dmg: number, dist: number): void {
    const def = ENEMIES[e.defId];
    e.hp -= dmg;
    e.alert = true;
    this.hitMarker = 0.14;
    sfx.hit();
    this.spawnSparks(e.x, e.y, 0.55, def.b, 5, 2.4);
    if (e.stun > 0) sfx.stun();
    if (e.hp <= 0) this.killEnemy(e);
    else if (!def.ranged) {
      // melee types get knocked back slightly — keeps pressure readable
      const d = Math.max(0.5, dist);
      const kx = (e.x - this.px) / d * 0.35, ky = (e.y - this.py) / d * 0.35;
      if (!this.blocked(e.x + kx, e.y + ky, 0.3)) { e.x += kx; e.y += ky; }
    }
  }

  private killEnemy(e: Ent): void {
    const def = ENEMIES[e.defId];
    e.dead = true;
    const cred = def.credits * (e.elite ? 2 : 1);
    this.runCredits += cred;
    this.kills += 1;
    this.msg(`+${cred}c — ${def.name}${e.elite ? " (ELITE)" : ""} NEUTRALIZED`, e.elite ? "#e8c23c" : "#4ef08a");
    sfx.kill();
    this.spawnSparks(e.x, e.y, 0.5, def.b, 14, 3.4);
    this.spawnRing(e.x, e.y, def.b, 0.4, 3);
    if (e.defId === "boss") {
      const portal = this.d.ents.find((p) => p.kind === "portal");
      if (portal) portal.locked = false;
      this.shake = 1;
      this.msg("THE ASCENDANT HAS FALLEN — GATE UNLOCKED", "#5ff2c0");
      sfx.explosion();
      this.spawnRing(e.x, e.y, "#ff4655", 1.2, 9);
    }
  }

  private damagePlayer(raw: number, src: string): void {
    if (this.state !== "playing") return;
    const a = this.squad[this.active];
    const dmg = Math.max(1, Math.round(raw));
    a.hp -= dmg;
    this.hitFlash = 0.55;
    this.shake = Math.max(this.shake, 0.45);
    sfx.hurt();
    if (a.hp <= 0) {
      a.hp = 0;
      a.alive = false;
      sfx.agentDown();
      this.msg(`${a.def.name} IS DOWN`, "#ff4655");
      const next = this.squad.findIndex((s) => s.alive);
      if (next < 0) {
        this.msg(`CAUSE OF LOSS: ${src}`, "#ff4655");
        this.endRun(false, false);
        return;
      }
      this.active = next;
      this.msg(`COMMAND → ${this.squad[next].def.role}`, this.squad[next].def.color);
    }
  }

  private useSpecial(): void {
    if (this.state !== "playing") return;
    const a = this.squad[this.active];
    if (!a.alive) return;
    const sp = a.def.special;
    if (a.specialCd > 0 || a.energy < sp.energy) {
      sfx.locked();
      this.msg(a.energy < sp.energy ? "CAPACITORS CHARGING…" : "ABILITY COOLING DOWN", "#ffb03a");
      return;
    }
    a.energy -= sp.energy;
    a.specialCd = 0.6;
    const dmgMul = 1 + 0.08 * upgradeRank(this.meta, "firepower");

    switch (sp.key) {
      case "frag": {
        sfx.shoot("scatter");
        let tx = this.px + Math.cos(this.ang) * 4.5;
        let ty = this.py + Math.sin(this.ang) * 4.5;
        let bt = 6;
        for (const e of this.d.ents) {
          if (e.kind !== "enemy" || e.dead) continue;
          const t = this.angleTo(e);
          if (t.dist < bt && t.angDiff < 0.45) { bt = t.dist; tx = e.x; ty = e.y; }
        }
        const wall = this.cast(this.px, this.py, Math.cos(this.ang), Math.sin(this.ang));
        const dClamp = Math.min(wall.dist - 0.3, Math.hypot(tx - this.px, ty - this.py));
        tx = this.px + Math.cos(this.ang) * Math.max(1.5, dClamp);
        ty = this.py + Math.sin(this.ang) * Math.max(1.5, dClamp);
        this.explode(tx, ty, 2.4, 62 * dmgMul);
        break;
      }
      case "heal": {
        sfx.heal();
        this.greenFlash = 0.4;
        for (const s of this.squad) if (s.alive) s.hp = Math.min(s.maxHp, s.hp + 35);
        this.spawnRing(this.px, this.py, "#3ad8b0", 0.8, 4);
        this.msg("NANO-MEND WAVE — SQUAD RESTORED", "#3ad8b0");
        break;
      }
      case "shockwave": {
        sfx.shockwave();
        this.shake = 0.8;
        this.spawnRing(this.px, this.py, "#ffb03a", 1, 5);
        for (const e of this.d.ents) {
          if (e.kind !== "enemy" || e.dead) continue;
          const dx = e.x - this.px, dy = e.y - this.py;
          const dist = Math.hypot(dx, dy);
          if (dist < 3.2) {
            this.hurtEnemy(e, 32 * dmgMul, dist);
            const k = 1.5 / Math.max(0.6, dist);
            if (!this.blocked(e.x + dx * k, e.y + dy * k, 0.3)) { e.x += dx * k; e.y += dy * k; }
          }
        }
        // smash doors
        const d = this.d;
        for (let y = 0; y < d.H; y++)
          for (let x = 0; x < d.W; x++) {
            const t = d.cells[y * d.W + x];
            if ((t === T_DOOR || t === T_LOCKED) && Math.hypot(x + 0.5 - this.px, y + 0.5 - this.py) < 3) {
              d.cells[y * d.W + x] = 0;
              this.spawnSparks(x + 0.5, y + 0.5, 0.5, "#ffb03a", 6, 2);
            }
          }
        this.msg("CONCUSSION WAVE DETONATED", "#ffb03a");
        break;
      }
      case "emp": {
        sfx.emp();
        this.empFlash = 0.5;
        this.empT = 8;
        this.revealT = 8;
        this.exitSeen = true;
        let stunned = 0;
        for (const e of this.d.ents) {
          if (e.dead) continue;
          const dist = Math.hypot(e.x - this.px, e.y - this.py);
          if (dist > 8) continue;
          if (e.kind === "trap") { e.dead = true; this.spawnSparks(e.x, e.y, 0.3, "#3ad8e8", 5, 2); continue; }
          if (e.kind === "enemy" && ["drone", "turret", "synth"].includes(e.defId)) {
            e.stun = 6; stunned++;
            this.spawnSparks(e.x, e.y, 0.6, "#3ad8e8", 6, 2);
          }
        }
        this.spawnRing(this.px, this.py, "#3ad8e8", 1.4, 10);
        this.msg(`EMP SURGE — ${stunned} SYSTEMS DISABLED, HOSTILES PINGED`, "#3ad8e8");
        break;
      }
    }
  }

  private explode(x: number, y: number, r: number, dmg: number): void {
    sfx.explosion();
    this.shake = Math.max(this.shake, 0.9);
    this.spawnSparks(x, y, 0.5, "#ffd27a", 22, 5);
    this.spawnSparks(x, y, 0.5, "#ff8a3c", 14, 3.5);
    this.spawnRing(x, y, "#ffb03a", 0.8, r * 2.2);
    for (const e of this.d.ents) {
      if (e.kind !== "enemy" || e.dead) continue;
      const dist = Math.hypot(e.x - x, e.y - y);
      if (dist < r) this.hurtEnemy(e, dmg * (1 - (dist / r) * 0.55), dist);
    }
    const pd = Math.hypot(this.px - x, this.py - y);
    if (pd < r) this.damagePlayer(dmg * 0.22 * (1 - pd / r) + 2, "OWN ORDNANCE");
    const d = this.d;
    for (let yy = 0; yy < d.H; yy++)
      for (let xx = 0; xx < d.W; xx++) {
        const t = d.cells[yy * d.W + xx];
        if ((t === T_DOOR || t === T_LOCKED) && Math.hypot(xx + 0.5 - x, yy + 0.5 - y) < r) d.cells[yy * d.W + xx] = 0;
      }
  }

  private triggerTrap(e: Ent): void {
    e.dead = true;
    sfx.trap();
    this.shake = Math.max(this.shake, 0.5);
    this.spawnSparks(e.x, e.y, 0.3, "#e8a020", 10, 3);
    this.msg("PRESSURE PLATE — SPIKE TRAP!", "#e8a020");
    this.damagePlayer(13 * (1 - 0.07 * upgradeRank(this.meta, "plating")), "SPIKE TRAP");
  }

  private collect(e: Ent): void {
    e.dead = true;
    const v = this.squad;
    switch (e.defId) {
      case "cells": {
        const n = 42;
        for (const s of v) if (s.def.weapon.ammo === "cells") s.ammo += s.def.id === "vanguard" ? 28 : 14;
        sfx.pickup("ammo");
        this.msg(`+${n} PULSE CELLS`, "#4ef08a");
        break;
      }
      case "shells":
        for (const s of v) if (s.def.weapon.ammo === "shells") s.ammo += 10;
        sfx.pickup("ammo");
        this.msg("+10 SCATTER SHELLS", "#ffb03a");
        break;
      case "medkit": {
        const hurt = [...v].filter((s) => s.alive).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
        if (hurt) hurt.hp = Math.min(hurt.maxHp, hurt.hp + 45);
        sfx.pickup("med");
        this.greenFlash = 0.3;
        this.msg("FIELD MEDKIT — WORST WOUNDS PATCHED", "#3ad8b0");
        break;
      }
      case "energy":
        for (const s of v) if (s.alive) s.energy = Math.min(100, s.energy + 45);
        sfx.pickup("energy");
        this.msg("+45 CAPACITOR CHARGE (ALL AGENTS)", "#3ad8e8");
        break;
      case "credits": {
        const c = 25 + Math.floor(Math.random() * 40);
        this.runCredits += c;
        sfx.pickup("credits");
        this.msg(`+${c} REQUISITION CREDITS`, "#e8c23c");
        break;
      }
      case "artifact": {
        this.runCredits += 150;
        sfx.pickup("artifact");
        this.msg("XENO ARTIFACT RECOVERED — +150c", "#46e8d8");
        this.spawnRing(e.x, e.y, "#46e8d8", 0.6, 3);
        break;
      }
    }
  }

  private interact(): void {
    if (this.state !== "playing") return;
    // door in front
    const fx = this.px + Math.cos(this.ang) * 1.15;
    const fy = this.py + Math.sin(this.ang) * 1.15;
    const ix = fx | 0, iy = fy | 0;
    const d = this.d;
    const idx = iy * d.W + ix;
    if (ix >= 0 && iy >= 0 && ix < d.W && iy < d.H) {
      const t = d.cells[idx];
      if (t === T_DOOR) {
        d.cells[idx] = 0;
        sfx.door();
        this.msg("DOOR BREACHED", "#ffb03a");
        return;
      }
      if (t === T_LOCKED) {
        const tech = this.squad.find((s) => s.alive && s.def.id === "tech");
        if (tech) {
          d.cells[idx] = 0;
          sfx.door(); sfx.emp();
          this.msg("SECURITY SEAL BYPASSED", "#9bd1ff");
        } else {
          sfx.locked();
          this.msg("SEALED — REQUIRES TECH SPECIALIST (OR EXPLOSIVES)", "#ff4655");
        }
        return;
      }
    }
    // portal / prisoner
    for (const e of d.ents) {
      if (e.dead) continue;
      const dist = Math.hypot(e.x - this.px, e.y - this.py);
      if (e.kind === "portal" && dist < 2.0) {
        if (e.locked) {
          sfx.locked();
          this.shake = Math.max(this.shake, 0.2);
          this.msg("GATE SEALED — ELIMINATE THE ASCENDANT", "#ff4655");
        } else {
          this.extract();
        }
        return;
      }
      if (e.kind === "prisoner" && dist < 1.7) {
        this.rescue(e);
        return;
      }
    }
  }

  private rescue(e: Ent): void {
    e.dead = true;
    this.rescued += 1;
    sfx.rescue();
    this.spawnRing(e.x, e.y, "#3ad8e8", 0.8, 3);
    const deadSlot = this.squad.findIndex((s) => !s.alive);
    const cls = AGENTS.find((a) => a.id === e.defId) ?? AGENTS[0];
    if (deadSlot >= 0) {
      const fresh = this.mkAgent(cls);
      fresh.hp = Math.round(fresh.maxHp * 0.65);
      this.squad[deadSlot] = fresh;
      this.msg(`ABDUCTEE RESCUED — ${cls.role} JOINS THE SQUAD`, "#3ad8e8");
    } else {
      this.runCredits += 150;
      for (const s of this.squad) if (s.alive) s.hp = Math.min(s.maxHp, s.hp + 20);
      this.msg("ABDUCTEE EXTRACTED — +150c BOUNTY, SQUAD RALLIED", "#e8c23c");
    }
  }

  private extract(): void {
    const victory = isBossDepth(this.depth);
    const bonus = 150 + this.depth * 75 + (victory ? 400 : 0);
    this.runCredits += bonus;
    sfx.extract();
    this.msg(`SECTOR ${this.depth} CLEARED — +${bonus}c EXTRACTION BONUS`, "#5ff2c0");
    this.endRun(victory, false);
  }

  // ---------------- fx ----------------

  private spawnSparks(x: number, y: number, z: number, color: string, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 320) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const s = (0.3 + Math.random() * 0.7) * speed;
      this.particles.push({
        kind: "spark", x, y, z: z + (Math.random() - 0.5) * 0.2,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (Math.random() - 0.3) * 2.4,
        life: 0.4 + Math.random() * 0.3, maxLife: 0.7,
        color, size: 2 + Math.random() * 2.5, radius: 0, grow: 0,
      });
    }
  }

  private spawnRing(x: number, y: number, color: string, radius: number, grow: number): void {
    this.particles.push({
      kind: "ring", x, y, z: 0.5, vx: 0, vy: 0, vz: 0,
      life: 0.5, maxLife: 0.5, color, size: 2, radius, grow,
    });
  }

  private tickFx(dt: number): void {
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.knifeSwing = Math.max(0, this.knifeSwing - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.6);
    this.empFlash = Math.max(0, this.empFlash - dt * 1.4);
    this.greenFlash = Math.max(0, this.greenFlash - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.sweep += dt;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      if (p.kind === "spark") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.z += p.vz * dt * 0.25;
        p.vz -= 6 * dt;
        if (p.z < 0.03) { p.z = 0.03; p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; }
      } else {
        p.radius += p.grow * dt * 4;
      }
    }
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      this.msgs[i].t -= dt;
      if (this.msgs[i].t <= 0) this.msgs.splice(i, 1);
    }
  }

  private msg(text: string, color: string): void {
    this.msgs.push({ text, color, t: 3.6 });
    if (this.msgs.length > 6) this.msgs.shift();
  }

  // ---------------- render ----------------

  private draw(): void {
    const ctx = this.ctx;
    if (!this.d || this.state === "idle") {
      ctx.fillStyle = "#04070c";
      ctx.fillRect(0, 0, VW, VH);
      return;
    }
    const f = this.faction();
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake * 12, (Math.random() - 0.5) * this.shake * 12);
    }

    // sky + floor gradients
    const sky = ctx.createLinearGradient(0, 0, 0, VH / 2);
    sky.addColorStop(0, `rgb(${f.sky[0]},${f.sky[1]},${f.sky[2]})`);
    sky.addColorStop(1, `rgb(${f.fog[0]},${f.fog[1]},${f.fog[2]})`);
    ctx.fillStyle = sky;
    ctx.fillRect(-12, -12, VW + 24, VH / 2 + 12);
    const fl = ctx.createLinearGradient(0, VH / 2, 0, VH);
    fl.addColorStop(0, `rgb(${f.fog[0]},${f.fog[1]},${f.fog[2]})`);
    fl.addColorStop(1, `rgb(${f.floor[0]},${f.floor[1]},${f.floor[2]})`);
    ctx.fillStyle = fl;
    ctx.fillRect(-12, VH / 2, VW + 24, VH / 2 + 12);

    // walls
    const dirX = Math.cos(this.ang), dirY = Math.sin(this.ang);
    const planeX = -dirY * PLANE, planeY = dirX * PLANE;
    const [wr, wg, wb] = f.walls;
    const [ar, ag, ab] = f.accent;
    const [fr, fg, fb] = f.fog;

    for (let x = 0; x < VW; x++) {
      const cameraX = (2 * x) / VW - 1;
      const rdx = dirX + planeX * cameraX;
      const rdy = dirY + planeY * cameraX;
      const hit = this.cast(this.px, this.py, rdx, rdy);
      this.zbuf[x] = hit.dist;
      const lh = VH / hit.dist;
      const top = VH / 2 - lh / 2;
      let cr: number, cg: number, cb: number;
      const isDoor = hit.tile === T_DOOR || hit.tile === T_LOCKED;
      if (hit.tile === 2) { cr = ar; cg = ag; cb = ab; }
      else if (isDoor) { cr = ar * 0.55; cg = ag * 0.55; cb = ab * 0.55; }
      else { cr = wr; cg = wg; cb = wb; }
      if (hit.side === 1) { cr *= 0.7; cg *= 0.7; cb *= 0.7; }
      // panel modulation
      const band = Math.floor(hit.wallX * 6);
      if (hit.tile === 2 && band % 3 === 0) { cr = Math.min(255, cr * 1.45); cg = Math.min(255, cg * 1.45); cb = Math.min(255, cb * 1.45); }
      if (isDoor && band % 2 === 0) { cr *= 0.72; cg *= 0.72; cb *= 0.72; }
      if (hit.tile === T_LOCKED && band % 2 === 1) { cr = Math.min(255, cr + 40); }
      const fog = Math.min(1, hit.dist / WALL_H) * 0.94;
      cr = (cr + (fr - cr) * fog) | 0;
      cg = (cg + (fg - cg) * fog) | 0;
      cb = (cb + (fb - cb) * fog) | 0;
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(x, top, 1, lh);
      // accent trim line at wall base
      if (hit.tile === 2 && hit.dist < 9) {
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${0.5 * (1 - hit.dist / 9)})`;
        ctx.fillRect(x, top + lh * 0.62, 1, Math.max(1, lh * 0.02));
      }
    }

    this.drawSprites(ctx, dirX, dirY, planeX, planeY);
    this.drawParticles(ctx, dirX, dirY, planeX, planeY);
    ctx.restore();

    this.drawViewModel(ctx);
    this.drawOverlays(ctx);
    this.drawMinimap();
    if (this.bigMapOpen && this.bctx && this.big) this.drawBigMap();
  }

  private project(e: { x: number; y: number }, dirX: number, dirY: number, planeX: number, planeY: number) {
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const relX = e.x - this.px, relY = e.y - this.py;
    const transformX = invDet * (dirY * relX - dirX * relY);
    const transformY = invDet * (-planeY * relX + planeX * relY);
    return { transformX, transformY, screenX: (VW / 2) * (1 + transformX / transformY) };
  }

  private drawSprites(ctx: CanvasRenderingContext2D, dirX: number, dirY: number, planeX: number, planeY: number): void {
    const f = this.faction();
    const [fr, fg, fb] = f.fog;
    interface D { e: Ent; tY: number; sX: number }
    const list: D[] = [];
    for (const e of this.d.ents) {
      if (e.dead && e.kind !== "portal") continue;
      const p = this.project(e, dirX, dirY, planeX, planeY);
      if (p.transformY > 0.15 && p.transformY < 40) list.push({ e, tY: p.transformY, sX: p.screenX });
    }
    list.sort((a, b) => b.tY - a.tY);

    for (const { e, tY, sX } of list) {
      let spr: HTMLCanvasElement;
      let scale = 1;
      let lift = 0;
      if (e.kind === "portal") {
        this.renderPortal(e.locked);
        spr = this.portalCv;
        scale = 1.15;
        lift = -0.02;
      } else if (e.kind === "enemy") {
        const def = ENEMIES[e.defId];
        spr = getSprite(def.body, def.a, def.b);
        scale = def.scale * (e.elite ? 1.12 : 1);
        lift = def.body === "drone" ? -0.08 + Math.sin(this.time * 3 + e.seed) * 0.03 : 0;
        if (e.stun > 0) lift += Math.sin(this.time * 40 + e.seed) * 0.008;
      } else if (e.kind === "prisoner") {
        spr = getSprite("prisoner", "#8a6a42", "#3ad8e8");
        scale = 0.95;
      } else if (e.kind === "trap") {
        spr = getSprite("trap", "#14181c", "#e8a020");
        scale = 0.72;
        lift = 0.36;
      } else {
        spr = getSprite(e.defId, "#ffffff", "#ffffff");
        scale = e.defId === "artifact" ? 0.62 : 0.5;
        lift = 0.16 + Math.sin(this.time * 3 + e.seed) * 0.03;
      }

      const sprSize = e.kind === "portal" || (e.kind === "enemy" && e.defId === "boss") ? 96 : SPR;
      const h = (VH / tY) * scale * 0.96;
      const w = h;
      const top = VH / 2 - h / 2 + (VH / tY) * lift;
      const left = sX - w / 2;
      const fogA = Math.min(0.93, (tY / WALL_H) * 0.94);
      ctx.fillStyle = `rgba(${fr},${fg},${fb},${fogA})`;

      // elite ground ring
      if (e.kind === "enemy" && e.elite) {
        const cc = Math.round(sX);
        if (cc >= 0 && cc < VW && this.zbuf[cc] > tY) {
          ctx.save();
          ctx.strokeStyle = "rgba(232,194,60,0.75)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(sX, top + h, w * 0.34, w * 0.09, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      const x0 = Math.max(0, Math.floor(left));
      const x1 = Math.min(VW, Math.ceil(left + w));
      for (let x = x0; x < x1; x++) {
        if (this.zbuf[x] <= tY) continue;
        const texX = (((x - left) / w) * sprSize) | 0;
        ctx.drawImage(spr, texX, 0, 1, sprSize, x, top, 1, h);
        if (fogA > 0.04) ctx.fillRect(x, top, 1, h);
      }

      // enemy hp bar
      if (e.kind === "enemy" && e.hp < e.maxHp) {
        const cc = Math.round(sX);
        if (cc >= 0 && cc < VW && this.zbuf[cc] > tY && tY < 14) {
          const bw = w * 0.5;
          const pct = clamp(e.hp / e.maxHp, 0, 1);
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(sX - bw / 2, top - 7, bw, 4);
          ctx.fillStyle = pct > 0.4 ? "#4ef08a" : "#ff4655";
          ctx.fillRect(sX - bw / 2 + 1, top - 6, (bw - 2) * pct, 2);
        }
      }
      // prisoner beacon
      if (e.kind === "prisoner") {
        const cc = Math.round(sX);
        if (cc >= 0 && cc < VW && this.zbuf[cc] > tY) {
          const by = top - 14 + Math.sin(this.time * 4) * 4;
          ctx.fillStyle = "rgba(58,216,232,0.9)";
          ctx.save();
          ctx.translate(sX, by);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-4, -4, 8, 8);
          ctx.restore();
          ctx.fillStyle = "rgba(58,216,232,0.25)";
          ctx.fillRect(sX - 1, by + 6, 2, top + h * 0.4 - by);
        }
      }
    }
  }

  private renderPortal(locked: boolean): void {
    const c = this.portalCv;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 96, 96);
    const col = locked ? "#ff4655" : "#5ff2c0";
    const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 42);
    if (locked) {
      g.addColorStop(0, "rgba(255,120,120,0.85)");
      g.addColorStop(0.5, "rgba(216,74,90,0.3)");
      g.addColorStop(1, "rgba(40,8,12,0)");
    } else {
      g.addColorStop(0, "rgba(174,247,220,0.9)");
      g.addColorStop(0.5, "rgba(95,242,192,0.32)");
      g.addColorStop(1, "rgba(10,42,34,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(48, 48, 42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -this.time * 46;
    ctx.beginPath(); ctx.arc(48, 48, 36, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([6, 16]);
    ctx.lineDashOffset = this.time * 70;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(48, 48, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a0 = this.time * (1.2 + i * 0.4) + i * 2.1;
      ctx.beginPath();
      ctx.arc(48, 48, 12 + i * 6, a0, a0 + 1.6);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(locked ? "LOCKED" : "EXIT", 48, 52);
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dirX: number, dirY: number, planeX: number, planeY: number): void {
    for (const p of this.particles) {
      const pr = this.project(p, dirX, dirY, planeX, planeY);
      if (pr.transformY <= 0.15) continue;
      const cc = Math.round(pr.screenX);
      if (cc < 0 || cc >= VW || this.zbuf[cc] <= pr.transformY) continue;
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      const unit = VH / pr.transformY;
      const sy = VH / 2 + (0.5 - p.z) * unit;
      if (p.kind === "spark") {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(pr.screenX - p.size / 2, sy - p.size / 2, p.size, p.size);
      } else {
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(pr.screenX, VH / 2 + 0.5 * unit, p.radius * unit, p.radius * unit * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawViewModel(ctx: CanvasRenderingContext2D): void {
    if (this.state === "idle") return;
    const a = this.squad[this.active];
    if (!a) return;
    const bob = this.moving ? Math.sin(this.walkT) * 5 : Math.sin(this.time * 1.6) * 2;
    const rec = this.recoil * 16;
    const gx = VW / 2 + 90 + (this.moving ? Math.cos(this.walkT * 0.5) * 4 : 0);
    const gy = VH - 64 + bob + rec;
    ctx.save();
    ctx.translate(gx, gy);
    if (this.knifeSwing > 0) {
      ctx.rotate(-0.9 + (0.25 - this.knifeSwing) * 5);
      ctx.fillStyle = "#c8d4dc";
      ctx.beginPath();
      ctx.moveTo(-120, -30); ctx.lineTo(-30, -46); ctx.lineTo(-26, -30);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2a3238";
      ctx.fillRect(-30, -44, 26, 16);
      ctx.restore();
      return;
    }
    const wtype = a.def.weapon.sfx;
    // gun body silhouette
    ctx.fillStyle = "#1a222a";
    ctx.fillRect(-150, -26, 240, 40);
    ctx.fillStyle = "#232c35";
    ctx.fillRect(-150, -34, 190, 16);
    if (wtype === "scatter") {
      ctx.fillStyle = "#141b21";
      ctx.fillRect(-210, -20, 90, 22);
      ctx.fillRect(-210, 0, 90, 8);
    } else if (wtype === "zap") {
      ctx.fillStyle = "#141b21";
      ctx.fillRect(-200, -22, 70, 18);
      ctx.strokeStyle = a.def.color;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-160 + i * 12, -13, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "#141b21";
      ctx.fillRect(-205, -18, 70, 14);
    }
    if (wtype === "pistol") {
      ctx.fillStyle = "#04070c";
      ctx.fillRect(-150, -26, 150, 40);
      ctx.fillStyle = "#1a222a";
      ctx.fillRect(-190, -20, 60, 12);
    }
    // grip + magazine
    ctx.fillStyle = "#10161c";
    ctx.fillRect(20, 10, 26, 44);
    ctx.fillRect(-60, 8, 20, 30);
    // sight
    ctx.fillStyle = "#0d1319";
    ctx.fillRect(-40, -46, 10, 14);
    // accent stripe + LED
    ctx.fillStyle = a.def.color;
    ctx.fillRect(-140, -8, 180, 4);
    const lowAmmo = a.def.weapon.ammo !== "energy" && a.ammo <= 5;
    ctx.fillStyle = lowAmmo ? (Math.sin(this.time * 12) > 0 ? "#ff4655" : "#3a1015") : a.def.color;
    ctx.fillRect(52, -18, 12, 8);
    // muzzle flash
    if (this.muzzle > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const mx = wtype === "pistol" ? -195 : -212;
      const my = wtype === "scatter" ? -9 : -11;
      const r = 16 + Math.random() * 10;
      const g = ctx.createRadialGradient(mx, my, 2, mx, my, r);
      g.addColorStop(0, "rgba(255,255,230,0.95)");
      g.addColorStop(0.4, "rgba(255,210,122,0.7)");
      g.addColorStop(1, "rgba(255,140,60,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    // faction tint + vignette
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, 0, VW, 52);
    const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, VH * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VW, VH);

    const a = this.squad[this.active];
    if (a && a.alive && a.hp / a.maxHp < 0.3 && this.state === "playing") {
      const p = (Math.sin(this.time * 6) + 1) / 2;
      const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.75);
      g.addColorStop(0, "rgba(255,70,85,0)");
      g.addColorStop(1, `rgba(255,70,85,${0.18 + p * 0.22})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,40,50,${this.hitFlash * 0.34})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (this.empFlash > 0) {
      ctx.fillStyle = `rgba(58,216,232,${this.empFlash * 0.22})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (this.greenFlash > 0) {
      ctx.fillStyle = `rgba(58,216,176,${this.greenFlash * 0.18})`;
      ctx.fillRect(0, 0, VW, VH);
    }

    if (this.state === "playing" || this.state === "paused") {
      // crosshair
      const gap = 7 + this.recoil * 16 + (this.moving ? 3 : 0);
      ctx.strokeStyle = this.hitMarker > 0 ? "#ffffff" : "rgba(78,240,138,0.9)";
      ctx.lineWidth = 2;
      const cx = VW / 2, cy = VH / 2;
      ctx.beginPath();
      ctx.moveTo(cx - gap - 7, cy); ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + 7, cy);
      ctx.moveTo(cx, cy - gap - 7); ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + 7);
      ctx.stroke();
      ctx.fillStyle = "rgba(78,240,138,0.9)";
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
      if (this.hitMarker > 0) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = `rgba(255,120,120,${this.hitMarker * 6})`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
      }

      // message feed
      ctx.textAlign = "left";
      ctx.font = "600 15px Rajdhani, sans-serif";
      let my = 92;
      for (const m of this.msgs) {
        const al = clamp(m.t / 0.5, 0, 1);
        ctx.fillStyle = `rgba(4,7,12,${0.55 * al})`;
        const tw = ctx.measureText(m.text).width;
        ctx.fillRect(14, my - 13, tw + 14, 18);
        ctx.fillStyle = m.color;
        ctx.globalAlpha = al;
        ctx.fillText(m.text, 21, my);
        ctx.globalAlpha = 1;
        my += 20;
      }

      // interact prompt
      if (this.prompt && this.promptT > 0) {
        ctx.textAlign = "center";
        ctx.font = "700 17px Rajdhani, sans-serif";
        const pw = ctx.measureText(this.prompt).width;
        ctx.fillStyle = "rgba(4,7,12,0.7)";
        ctx.fillRect(VW / 2 - pw / 2 - 12, VH * 0.66 - 16, pw + 24, 24);
        ctx.fillStyle = "#5ff2c0";
        ctx.fillText(this.prompt, VW / 2, VH * 0.66 + 2);
      }
      ctx.textAlign = "left";
    }

    if (this.state === "over") {
      ctx.fillStyle = "rgba(60,8,14,0.35)";
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  private drawMapOn(ctx: CanvasRenderingContext2D, size: number): void {
    const d = this.d;
    const s = size / d.W;
    const f = this.faction();
    ctx.fillStyle = "rgba(4,10,14,0.88)";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < d.H; y++)
      for (let x = 0; x < d.W; x++) {
        if (!d.explored[y * d.W + x]) continue;
        const t = d.cells[y * d.W + x];
        if (t === 0) ctx.fillStyle = "rgba(18,34,44,0.9)";
        else if (t === 2) ctx.fillStyle = f.accentHex;
        else if (t === T_DOOR) ctx.fillStyle = "#ffb03a";
        else if (t === T_LOCKED) ctx.fillStyle = "#ff4655";
        else ctx.fillStyle = "#2c4a5c";
        ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      }
    // exit marker
    const showExit = this.exitSeen || this.revealT > 0;
    if (showExit) {
      const pulse = (Math.sin(this.time * 5) + 1) / 2;
      ctx.fillStyle = `rgba(95,242,192,${0.5 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(d.exitX * s, d.exitY * s, s * 0.9 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // enemies (revealed by EMP)
    if (this.revealT > 0 || this.empT > 0) {
      ctx.fillStyle = "#ff4655";
      for (const e of d.ents) {
        if (e.kind !== "enemy" || e.dead) continue;
        ctx.beginPath();
        ctx.arc(e.x * s, e.y * s, e.defId === "boss" ? s * 0.9 : s * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // prisoners
    ctx.fillStyle = "#3ad8e8";
    for (const e of d.ents) {
      if (e.kind !== "prisoner" || e.dead) continue;
      if (!d.explored[(e.y | 0) * d.W + (e.x | 0)]) continue;
      ctx.fillRect(e.x * s - s * 0.4, e.y * s - s * 0.4, s * 0.8, s * 0.8);
    }
    // player arrow
    ctx.save();
    ctx.translate(this.px * s, this.py * s);
    ctx.rotate(this.ang);
    ctx.fillStyle = "#4ef08a";
    ctx.beginPath();
    ctx.moveTo(s * 1.1, 0); ctx.lineTo(-s * 0.7, -s * 0.7); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.7, s * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // radar sweep
    ctx.save();
    ctx.translate(this.px * s, this.py * s);
    ctx.rotate(this.sweep * 1.4);
    const sg = ctx.createLinearGradient(0, 0, s * 7, 0);
    sg.addColorStop(0, "rgba(78,240,138,0.3)");
    sg.addColorStop(1, "rgba(78,240,138,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, s * 7, -0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // frame ticks
    ctx.strokeStyle = "rgba(78,240,138,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  private drawMinimap(): void {
    if (this.state === "idle") return;
    const m = this.mini;
    this.mctx.clearRect(0, 0, m.width, m.height);
    this.drawMapOn(this.mctx, m.width);
  }

  private drawBigMap(): void {
    if (!this.bctx || !this.big) return;
    this.bctx.clearRect(0, 0, this.big.width, this.big.height);
    this.drawMapOn(this.bctx, this.big.width);
  }

  // ---------------- hud snapshot ----------------

  snapshot(): HudSnapshot {
    if (!this.d || !this.meta) {
      return {
        depth: 0, faction: "", factionSub: "", accent: "#4ef08a", credits: 0, runCredits: 0,
        kills: 0, timeSec: 0, objective: "", mapPct: 0, revealT: 0, empT: 0, agents: [],
        boss: null, weaponName: "", specialHint: "", state: this.state,
      };
    }
    const bossEnt = this.d?.ents.find((e) => e.kind === "enemy" && e.defId === "boss" && !e.dead);
    let explored = 0, floorCount = 0;
    if (this.d) {
      for (let i = 0; i < this.d.cells.length; i++) {
        const passable = this.d.cells[i] === 0 || this.d.cells[i] === T_DOOR || this.d.cells[i] === T_LOCKED;
        if (passable) {
          floorCount++;
          if (this.d.explored[i]) explored++;
        }
      }
    }
    const a = this.squad[this.active];
    return {
      depth: this.depth,
      faction: this.faction().label,
      factionSub: this.faction().sub,
      accent: this.faction().accentHex,
      credits: this.meta ? this.meta.credits + this.runCredits : 0,
      runCredits: this.runCredits,
      kills: this.kills,
      timeSec: Math.round(this.runTime),
      objective: bossEnt
        ? "ELIMINATE THE ASCENDANT — UNLOCK THE GATE"
        : this.exitSeen
          ? "REACH THE EXTRACTION GATE"
          : "LOCATE THE EXTRACTION GATE",
      mapPct: floorCount ? Math.round((explored / floorCount) * 100) : 0,
      revealT: this.revealT,
      empT: this.empT,
      agents: this.squad.map((s, i) => ({
        name: s.def.name, role: s.def.role, color: s.def.color,
        hp: Math.max(0, Math.round(s.hp)), maxHp: s.maxHp,
        energy: Math.round(s.energy),
        ammo: s.ammo,
        ammoLabel: s.def.weapon.ammo === "cells" ? "CELLS" : s.def.weapon.ammo === "shells" ? "SHELLS" : "CAP",
        alive: s.alive, active: i === this.active,
        specialName: s.def.special.name, specialEnergy: s.def.special.energy,
      })),
      boss: bossEnt ? { name: ENEMIES.boss.name, hp: Math.max(0, Math.round(bossEnt.hp)), maxHp: bossEnt.maxHp } : null,
      weaponName: a ? (a.def.weapon.ammo !== "energy" && a.ammo <= 0 ? "COMBAT KNIFE" : a.def.weapon.name) : "",
      specialHint: a ? a.def.special.name : "",
      state: this.state,
    };
  }

  static factionPreview(i: number) { return FACTIONS[i % FACTIONS.length]; }
}
