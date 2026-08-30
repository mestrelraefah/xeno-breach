// ============ XENOBREACH — static game data & types ============

export type AmmoKind = "cells" | "shells" | "energy";

export interface WeaponDef {
  name: string;
  dmg: number;
  rof: number;        // seconds between shots
  range: number;
  spread: number;     // radians
  pellets: number;
  ammo: AmmoKind;
  cost: number;       // ammo/energy per shot
  auto: boolean;
  sfx: "pulse" | "pistol" | "scatter" | "zap";
  chain?: number;     // arc-zapper chain count
}

export interface SpecialDef {
  name: string;
  desc: string;
  energy: number;
  key: "frag" | "heal" | "shockwave" | "emp";
}

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  color: string;
  maxHp: number;
  bio: string;
  weapon: WeaponDef;
  special: SpecialDef;
}

export const AGENTS: AgentDef[] = [
  {
    id: "vanguard",
    name: "CMDR. R. KESSLER",
    role: "VANGUARD",
    color: "#4ef08a",
    maxHp: 100,
    bio: "Strike leader. Frontline carbine, frag burst for crowded corridors.",
    weapon: { name: "VK-77 PULSE CARBINE", dmg: 11, rof: 0.13, range: 20, spread: 0.02, pellets: 1, ammo: "cells", cost: 1, auto: true, sfx: "pulse" },
    special: { name: "M-9 FRAG BURST", desc: "Thrown blast — 2.4m radius, 60 dmg", energy: 35, key: "frag" },
  },
  {
    id: "medic",
    name: "DR. A. OKAFOR",
    role: "MEDIC",
    color: "#3ad8b0",
    maxHp: 85,
    bio: "Combat surgeon. Keeps the squad vertical with nano-mend waves.",
    weapon: { name: "LANCET STIM PISTOL", dmg: 8, rof: 0.2, range: 16, spread: 0.015, pellets: 1, ammo: "cells", cost: 1, auto: false, sfx: "pistol" },
    special: { name: "NANO-MEND WAVE", desc: "Restore 35 HP to every living agent", energy: 55, key: "heal" },
  },
  {
    id: "breacher",
    name: 'SGT. "BRICKS" TANAKA',
    role: "BREACHER",
    color: "#ffb03a",
    maxHp: 125,
    bio: "Door problem, solved. Scattergun up close, concussion wave otherwise.",
    weapon: { name: "RIOT SCATTERGUN", dmg: 7, rof: 0.72, range: 9, spread: 0.1, pellets: 6, ammo: "shells", cost: 1, auto: false, sfx: "scatter" },
    special: { name: "CONCUSSION WAVE", desc: "3m shockwave — 30 dmg, shoves foes, smashes doors", energy: 45, key: "shockwave" },
  },
  {
    id: "tech",
    name: "SPC. L. DUARTE",
    role: "TECH",
    color: "#9bd1ff",
    maxHp: 90,
    bio: "Systems cracker. Arc zapper draws from suit capacitors. Unlocks sealed doors.",
    weapon: { name: "ARC ZAPPER MK.II", dmg: 13, rof: 0.3, range: 15, spread: 0.01, pellets: 1, ammo: "energy", cost: 9, auto: false, sfx: "zap", chain: 2 },
    special: { name: "EMP SURGE", desc: "8m pulse — stuns drones & turrets, pings hostiles + gate, kills traps", energy: 50, key: "emp" },
  },
];

// ============ enemies ============

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  ranged: boolean;
  rof: number;
  range: number;
  body: "humanoid" | "drone" | "grey" | "reptoid" | "insectoid" | "guardian" | "clone" | "turret" | "boss";
  a: string; // base color
  b: string; // glow color
  credits: number;
  scale: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  scav:      { id: "scav",      name: "RUSTHALO SCAVENGER",   hp: 26,  dmg: 8,  speed: 2.3, ranged: false, rof: 0,   range: 0,  body: "humanoid",  a: "#8a5a32", b: "#e8963c", credits: 12, scale: 1 },
  drone:     { id: "drone",     name: "KX-SENTINEL DRONE",    hp: 18,  dmg: 6,  speed: 2.6, ranged: true,  rof: 1.7, range: 8,  body: "drone",     a: "#5a6a78", b: "#46e0e8", credits: 14, scale: 0.8 },
  synth:     { id: "synth",     name: "SYNTHETIC HUMANOID",   hp: 34,  dmg: 9,  speed: 2.0, ranged: true,  rof: 1.4, range: 10, body: "humanoid",  a: "#9fb4c4", b: "#46e0e8", credits: 18, scale: 1 },
  merc:      { id: "merc",      name: "HELIXCORP MERC",       hp: 46,  dmg: 11, speed: 1.9, ranged: true,  rof: 1.5, range: 10, body: "humanoid",  a: "#6a6a42", b: "#d8b23a", credits: 22, scale: 1.05 },
  guardian:  { id: "guardian",  name: "SEEDER GUARDIAN",      hp: 85,  dmg: 18, speed: 1.4, ranged: false, rof: 0,   range: 0,  body: "guardian",  a: "#b09050", b: "#46e8d8", credits: 30, scale: 1.25 },
  grey:      { id: "grey",      name: "NEBU SWARM GREY",      hp: 22,  dmg: 7,  speed: 2.4, ranged: true,  rof: 1.8, range: 7,  body: "grey",      a: "#b8c8b8", b: "#9fe8b0", credits: 16, scale: 0.9 },
  reptoid:   { id: "reptoid",   name: "CYAKAHRR REPTOID",     hp: 38,  dmg: 13, speed: 2.5, ranged: false, rof: 0,   range: 0,  body: "reptoid",   a: "#4a7a3a", b: "#b0d84a", credits: 20, scale: 1.05 },
  insectoid: { id: "insectoid", name: "NEGUMAK GNOMOPPO",     hp: 24,  dmg: 8,  speed: 2.8, ranged: false, rof: 0,   range: 0,  body: "insectoid", a: "#7a5a2a", b: "#e8963c", credits: 15, scale: 0.85 },
  clone:     { id: "clone",     name: "OOGANGA CLONE TROOPER",hp: 30,  dmg: 9,  speed: 2.1, ranged: true,  rof: 1.5, range: 9,  body: "clone",     a: "#c8d4e0", b: "#a8c8e8", credits: 18, scale: 1 },
  turret:    { id: "turret",    name: "AUTO-TURRET",          hp: 55,  dmg: 10, speed: 0,   ranged: true,  rof: 1.1, range: 11, body: "turret",    a: "#4a4a52", b: "#ff4655", credits: 25, scale: 0.9 },
  boss:      { id: "boss",      name: "VRAX'UL THE ASCENDANT",hp: 780, dmg: 20, speed: 1.7, ranged: true,  rof: 1.6, range: 12, body: "boss",      a: "#7a2a3a", b: "#ff4655", credits: 500, scale: 1.7 },
};

// ============ factions / depth themes ============

export interface Faction {
  id: string;
  label: string;
  sub: string;
  pool: string[];
  walls: [number, number, number];
  accent: [number, number, number];
  accentHex: string;
  fog: [number, number, number];
  floor: [number, number, number];
  sky: [number, number, number];
}

export const FACTIONS: Faction[] = [
  { id: "pirates",  label: "RUSTHALO CARTEL",        sub: "ORBITAL PIRATE OUTPOST",   pool: ["scav", "scav", "scav", "drone", "reptoid"],        walls: [122, 74, 43],  accent: [232, 150, 60], accentHex: "#e8963c", fog: [24, 12, 6],  floor: [34, 22, 14], sky: [12, 6, 3] },
  { id: "foundry",  label: "FOUNDRY 0-K",            sub: "DRONE & SYNTH WORKS",      pool: ["drone", "drone", "synth", "turret", "scav"],       walls: [61, 74, 86],   accent: [70, 224, 232], accentHex: "#46e0e8", fog: [6, 14, 18],  floor: [16, 24, 30], sky: [3, 8, 10] },
  { id: "helix",    label: "HELIXCORP SEC-SITE",     sub: "MEGACONGLOMERATE MERC POST",pool: ["merc", "merc", "synth", "clone", "turret"],       walls: [74, 74, 52],   accent: [216, 178, 58], accentHex: "#d8b23a", fog: [16, 14, 7],  floor: [26, 26, 16], sky: [8, 7, 3] },
  { id: "ruins",    label: "SEEDER RUINS XK-4",      sub: "ANNUNAKI EXCAVATION VAULT",pool: ["guardian", "guardian", "grey", "synth"],           walls: [92, 76, 50],   accent: [232, 194, 90], accentHex: "#e8c25a", fog: [18, 14, 7],  floor: [30, 24, 14], sky: [9, 7, 3] },
  { id: "hive",     label: "CYAKAHRR HIVE-WORLD",    sub: "REPTOID WARREN COMPLEX",   pool: ["reptoid", "reptoid", "insectoid", "insectoid", "guardian"], walls: [58, 74, 42], accent: [176, 216, 74], accentHex: "#b0d84a", fog: [10, 14, 5], floor: [20, 28, 14], sky: [5, 8, 3] },
  { id: "darkfleet",label: "DARK FLEET FLAGSHIP",    sub: "HYBRID COMMAND DREADNOUGHT",pool: ["grey", "clone", "synth", "merc", "turret"],        walls: [64, 44, 68],   accent: [216, 74, 90],  accentHex: "#d84a5a", fog: [13, 7, 16],  floor: [22, 14, 26], sky: [7, 3, 9] },
];

export function factionForDepth(d: number): Faction {
  return FACTIONS[(d - 1) % FACTIONS.length];
}
export function isBossDepth(d: number): boolean {
  return d % 6 === 0;
}

// ============ meta progression ============

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  icon: "vital" | "dmg" | "ammo" | "cap" | "armor" | "map";
}

export const UPGRADES: UpgradeDef[] = [
  { id: "vitality",   name: "VITALITY SERUM",     desc: "+15 max HP for every agent per rank",        icon: "vital" },
  { id: "firepower",  name: "HOT LOADS",          desc: "+8% weapon damage per rank",                 icon: "dmg" },
  { id: "logistics",  name: "DEEP POUCHES",       desc: "+20% starting ammo per rank",                icon: "ammo" },
  { id: "capacitors", name: "SUIT CAPACITORS",    desc: "+18% energy recharge rate per rank",         icon: "cap" },
  { id: "plating",    name: "SUB-DERMAL PLATING", desc: "-7% damage taken per rank",                  icon: "armor" },
  { id: "carto",      name: "ORBITAL CARTOGRAPHY",desc: "Wider map sweep on insertion per rank",      icon: "map" },
];

export const UPGRADE_COSTS = [120, 260, 480, 780, 1200];
export const MAX_RANK = 5;

export interface MetaSave {
  credits: number;
  bestDepth: number;
  runs: number;
  wins: number;
  kills: number;
  rescued: number;
  upgrades: Record<string, number>;
}

const META_KEY = "xenobreach_meta_v1";

export function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = JSON.parse(raw) as MetaSave;
      if (typeof m.credits === "number" && m.upgrades) return m;
    }
  } catch {
    /* fresh save */
  }
  return { credits: 0, bestDepth: 0, runs: 0, wins: 0, kills: 0, rescued: 0, upgrades: {} };
}

export function saveMeta(m: MetaSave): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable */
  }
}

export function upgradeRank(m: MetaSave, id: string): number {
  return m.upgrades[id] ?? 0;
}

export interface RunSummary {
  victory: boolean;
  abandon: boolean;
  depth: number;
  kills: number;
  creditsEarned: number;
  rescued: number;
  timeSec: number;
  faction: string;
}
