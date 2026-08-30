import { useEffect, useRef, useState } from "react";
import { Game } from "./game/engine";
import type { HudSnapshot } from "./game/engine";
import {
  AGENTS, FACTIONS, MAX_RANK, UPGRADES, UPGRADE_COSTS,
  factionForDepth, loadMeta, saveMeta, upgradeRank,
} from "./game/data";
import type { MetaSave, RunSummary } from "./game/data";
import { sfx } from "./game/audio";

type Screen = "title" | "run" | "pause" | "dead" | "clear" | "victory";

// ---------- tiny inline icons ----------
const IconCredit = ({ c = "#e8c23c", s = 14 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" className="inline-block">
    <path d="M8 1 L15 8 L8 15 L1 8 Z" fill={c} />
    <path d="M8 5 L11 8 L8 11 L5 8 Z" fill="#04070c" />
  </svg>
);
const IconSkull = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16">
    <path d="M8 1a6 6 0 0 0-6 6c0 2.5 1.3 4 3 5v3h6v-3c1.7-1 3-2.5 3-5a6 6 0 0 0-6-6z" fill="#ff4655" />
    <circle cx="5.6" cy="7" r="1.6" fill="#04070c" />
    <circle cx="10.4" cy="7" r="1.6" fill="#04070c" />
  </svg>
);
const IconPause = () => (
  <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg>
);
const IconSound = ({ off }: { off: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 14 14">
    <path d="M1 5h3l4-3v10L4 9H1z" fill="currentColor" />
    {off ? <path d="M9 4l4 6M13 4l-4 6" stroke="currentColor" strokeWidth="1.4" /> : <path d="M10 4c2 2 2 4 0 6" stroke="currentColor" strokeWidth="1.4" fill="none" />}
  </svg>
);

// ---------- ambient starfield ----------
function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7,
    }));
    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    let t = 0;
    const draw = () => {
      t += 0.016;
      ctx.fillStyle = "#04070c";
      ctx.fillRect(0, 0, cv.width, cv.height);
      const g1 = ctx.createRadialGradient(cv.width * 0.8, cv.height * 0.2, 40, cv.width * 0.8, cv.height * 0.2, cv.width * 0.5);
      g1.addColorStop(0, "rgba(30,80,60,0.16)");
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, cv.width, cv.height);
      const g2 = ctx.createRadialGradient(cv.width * 0.15, cv.height * 0.85, 30, cv.width * 0.15, cv.height * 0.85, cv.width * 0.45);
      g2.addColorStop(0, "rgba(70,30,40,0.14)");
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, cv.width, cv.height);
      for (const s of stars) {
        s.x += s.z * 0.00022;
        if (s.x > 1) s.x -= 1;
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.y * 40);
        ctx.fillStyle = `rgba(180,230,210,${0.15 + s.z * 0.5 * tw})`;
        const sz = s.z * 2;
        ctx.fillRect(s.x * cv.width, s.y * cv.height, sz, sz);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />;
}

// ---------- HUD sub-components ----------
function Bar({ pct, color, warn }: { pct: number; color: string; warn?: boolean }) {
  return (
    <div className="bar-shell h-[7px] w-full chamfer-sm">
      <div
        className={`bar-fill ${warn ? "pulse-danger" : ""}`}
        style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, background: color }}
      />
    </div>
  );
}

function SquadCard({ a, index }: { a: HudSnapshot["agents"][number]; index: number }) {
  return (
    <div
      className={`hud-panel chamfer-sm px-2 py-1.5 w-[168px] transition-all duration-150 ${
        a.active ? "outline outline-1 -outline-offset-1" : "opacity-85"
      } ${!a.alive ? "grayscale opacity-45" : ""}`}
      style={a.active ? { outlineColor: a.color, boxShadow: `0 0 16px ${a.color}44` } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <div className="w-7 h-7 chamfer-sm flex items-center justify-center font-display text-[11px] font-bold text-black shrink-0"
          style={{ background: a.color }}>
          {a.role.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[8.5px] tracking-wider text-bone truncate leading-tight">{a.name}</div>
          <div className="text-[9px] stencil leading-tight" style={{ color: a.color }}>{a.role}</div>
        </div>
        <span className="keycap shrink-0">{index + 1}</span>
      </div>
      {a.alive ? (
        <div className="mt-1 space-y-[3px]">
          <Bar pct={a.hp / a.maxHp} color={a.hp / a.maxHp < 0.3 ? "#ff4655" : "#4ef08a"} warn={a.hp / a.maxHp < 0.3} />
          <div className="flex items-center gap-1">
            <div className="flex-1"><Bar pct={a.energy / 100} color="#3ad8e8" /></div>
            <span className="font-display text-[8px] text-ice w-6 text-right">{a.energy}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-[9px] text-dim stencil">{a.ammoLabel}</span>
            <span className={`font-display text-[11px] font-bold ${a.ammoLabel !== "CAP" && a.ammo <= 5 ? "text-blood" : "text-bone"}`}>
              {a.ammoLabel === "CAP" ? "—" : a.ammo}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-1 font-display text-[10px] tracking-[0.3em] text-blood text-center py-1">K.I.A.</div>
      )}
    </div>
  );
}

// ---------- main app ----------
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const bigRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [bigOpen, setBigOpen] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [meta, setMeta] = useState<MetaSave>(() => loadMeta());
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !miniRef.current) return;
    const game = new Game(canvasRef.current, miniRef.current, bigRef.current, {
      onEnd: (s) => {
        setSummary(s);
        const st = gameRef.current?.state;
        if (s.abandon) setScreen("title");
        else if (st === "cleared") setScreen(s.victory ? "victory" : "clear");
        else setScreen("dead");
      },
      onPauseToggle: (p) => setScreen(p ? "pause" : "run"),
    });
    gameRef.current = game;
    const iv = window.setInterval(() => {
      if (!gameRef.current) return;
      setHud(gameRef.current.snapshot());
      setBigOpen(gameRef.current.bigMapOpen);
    }, 100);
    return () => { window.clearInterval(iv); game.destroy(); gameRef.current = null; };
  }, []);

  useEffect(() => {
    if (screen === "title") setMeta(loadMeta());
  }, [screen]);

  const deploy = () => {
    sfx.unlock();
    sfx.ui();
    const m = loadMeta();
    setMeta(m);
    gameRef.current?.startRun(m);
    setScreen("run");
  };
  const next = () => {
    sfx.ui();
    sfx.ambientStart();
    gameRef.current?.nextDepth();
    setScreen("run");
  };
  const toTitle = () => { sfx.ui(); setScreen("title"); };
  const resume = () => gameRef.current?.togglePause();
  const abandon = () => { sfx.ui(); gameRef.current?.abandon(); };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    sfx.setMuted(m);
  };
  const buy = (id: string) => {
    const m = { ...meta, upgrades: { ...meta.upgrades } };
    const rank = upgradeRank(m, id);
    const cost = UPGRADE_COSTS[rank];
    if (rank >= MAX_RANK || m.credits < cost) return;
    m.credits -= cost;
    m.upgrades[id] = rank + 1;
    saveMeta(m);
    setMeta(m);
    sfx.unlock();
    sfx.pickup("credits");
  };

  const inRun = screen === "run" || screen === "pause";
  const nextFaction = summary ? factionForDepth(summary.depth + 1) : FACTIONS[0];
  const mm = hud ? `${String(Math.floor(hud.timeSec / 60)).padStart(2, "0")}:${String(hud.timeSec % 60).padStart(2, "0")}` : "00:00";

  return (
    <div className="relative w-full h-full overflow-hidden bg-void font-body text-bone scanlines crt-flicker">
      <Starfield />

      {/* ======= GAME CANVAS (always mounted) ======= */}
      <div className={`absolute inset-0 ${screen === "title" ? "opacity-0 pointer-events-none" : ""}`}>
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover ${inRun ? "cursor-none" : ""}`}
        />
      </div>

      {/* ======= IN-GAME HUD ======= */}
      {inRun && hud && (
        <div className="absolute inset-0 pointer-events-none select-none">
          {/* top-left: sector banner */}
          <div className="absolute top-3 left-3 hud-panel chamfer px-3 py-2 min-w-[250px]">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[11px] font-bold stencil" style={{ color: hud.accent }}>
                SECTOR {String(hud.depth).padStart(2, "0")}
              </span>
              <span className="font-display text-[13px] font-extrabold tracking-widest text-bone">{hud.faction}</span>
            </div>
            <div className="text-[10px] stencil text-dim">{hud.factionSub}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-amber blink inline-block" />
              <span className="text-[12px] font-semibold text-amber stencil">{hud.objective}</span>
            </div>
          </div>

          {/* boss bar */}
          {hud.boss && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[420px] pointer-events-none">
              <div className="text-center font-display text-[11px] font-bold stencil text-blood tracking-[0.25em] mb-1">
                ⨯ {hud.boss.name} ⨯
              </div>
              <div className="bar-shell h-[10px] chamfer-sm" style={{ borderColor: "rgba(255,70,85,0.5)" }}>
                <div className="bar-fill" style={{ width: `${(hud.boss.hp / hud.boss.maxHp) * 100}%`, background: "linear-gradient(90deg, #7a1020, #ff4655)" }} />
              </div>
            </div>
          )}


          {/* bottom-left: squad */}
          <div className="absolute bottom-3 left-3 flex gap-2">
            {hud.agents.map((a, i) => <SquadCard key={i} a={a} index={i} />)}
          </div>

          {/* bottom-right: weapon / credits */}
          <div className="absolute bottom-3 right-3 text-right space-y-1.5">
            <div className="hud-panel chamfer px-3 py-2 min-w-[230px]">
              <div className="font-display text-[10px] stencil text-dim">ACTIVE SYSTEM</div>
              <div className="font-display text-[13px] font-bold text-bone tracking-wide">{hud.weaponName}</div>
              <div className="flex items-center justify-end gap-2 mt-0.5">
                <span className="text-[10px] stencil text-dim">[R] {hud.specialHint}</span>
              </div>
            </div>
            <div className="flex gap-1.5 justify-end">
              <div className="hud-panel chamfer-sm px-2.5 py-1 flex items-center gap-1.5">
                <IconCredit />
                <span className="font-display text-[13px] font-bold text-[#e8c23c]">{hud.credits}</span>
              </div>
              <div className="hud-panel chamfer-sm px-2.5 py-1 flex items-center gap-1.5">
                <IconSkull />
                <span className="font-display text-[13px] font-bold text-bone">{hud.kills}</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ======= MAP CANVASES (always mounted for engine refs) ======= */}
      <div className={`absolute top-3 right-3 z-10 ${inRun ? "" : "hidden"}`}>
        <div className="hud-panel chamfer p-1.5">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="font-display text-[9px] stencil text-phos">AUTO-MAP</span>
            <span className="text-[9px] text-dim font-display">{hud?.mapPct ?? 0}%</span>
          </div>
          <canvas ref={miniRef} width={176} height={176} className="block" style={{ width: 176, height: 176 }} />
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[9px] stencil text-dim">
              {(hud?.revealT ?? 0) > 0
                ? <span className="text-ice">HOSTILES PINGED {Math.ceil(hud?.revealT ?? 0)}s</span>
                : <span>[TAB] SECTOR MAP</span>}
            </span>
            <span className="font-display text-[9px] text-dim">{mm}</span>
          </div>
        </div>
        <div className="flex gap-1.5 mt-1.5 justify-end">
          <button onClick={() => gameRef.current?.togglePause()} className="btn-mil hud-panel chamfer-sm px-2.5 py-1.5 text-[10px] text-phos flex items-center gap-1.5">
            <IconPause /> HOLD
          </button>
          <button onClick={toggleMute} className="btn-mil hud-panel chamfer-sm px-2.5 py-1.5 text-[10px] text-phos flex items-center gap-1.5">
            <IconSound off={muted} /> {muted ? "MUTED" : "AUDIO"}
          </button>
        </div>
      </div>

      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-20 ${bigOpen && inRun ? "" : "hidden"}`}>
        <div className="hud-panel chamfer p-4 bg-[rgba(4,10,14,0.92)] rise-in">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-[12px] font-bold stencil" style={{ color: hud?.accent ?? "#4ef08a" }}>
              SECTOR MAP — {hud?.faction ?? ""}
            </span>
            <span className="text-[10px] stencil text-dim">[TAB] CLOSE</span>
          </div>
          <canvas ref={bigRef} width={480} height={480} style={{ width: 480, height: 480 }} />
          <div className="mt-2 grid grid-cols-4 gap-2 text-[10px] stencil text-dim">
            <span><span className="inline-block w-2 h-2 mr-1" style={{ background: hud?.accent ?? "#4ef08a" }} />STRUCTURE</span>
            <span><span className="inline-block w-2 h-2 mr-1 bg-amber" />DOOR</span>
            <span><span className="inline-block w-2 h-2 mr-1 bg-ice" />ABDUCTEE</span>
            <span><span className="inline-block w-2 h-2 mr-1 bg-[#5ff2c0]" />EXTRACT</span>
          </div>
        </div>
      </div>

      {/* ======= PAUSE ======= */}
      {screen === "pause" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(2,5,9,0.72)]">
          <div className="hud-panel chamfer p-8 w-[440px] rise-in">
            <div className="font-display text-[11px] stencil text-amber">TERRAN IDF — TACTICAL LINK</div>
            <h2 className="font-display text-3xl font-black tracking-widest text-bone mt-1">OPERATION HELD</h2>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-dim">
              <span><span className="keycap mr-1.5">W A S D</span>move</span>
              <span><span className="keycap mr-1.5">MOUSE</span>look / fire</span>
              <span><span className="keycap mr-1.5">R / RMB</span>special</span>
              <span><span className="keycap mr-1.5">1-4</span>switch agent</span>
              <span><span className="keycap mr-1.5">E</span>interact</span>
              <span><span className="keycap mr-1.5">TAB</span>sector map</span>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={resume} className="btn-mil chamfer flex-1 py-3 bg-phos text-black font-bold text-sm">RESUME</button>
              <button onClick={abandon} className="btn-mil chamfer flex-1 py-3 bg-[#2a1216] text-blood border border-blood/40 font-bold text-sm">ABANDON RUN</button>
            </div>
            <div className="mt-3 text-[11px] text-dim text-center stencil">Abandoning banks all credits earned this run</div>
          </div>
        </div>
      )}

      {/* ======= DEATH ======= */}
      {screen === "dead" && summary && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(20,3,6,0.68)]">
          <div className="hud-panel chamfer p-8 w-[500px] rise-in" style={{ borderColor: "rgba(255,70,85,0.45)" }}>
            <div className="font-display text-[11px] stencil text-blood">SIGNAL LOST — ALL VITALS FLAT</div>
            <h2 className="glitch-title font-display text-5xl font-black tracking-widest text-blood mt-1">SQUAD LOST</h2>
            <div className="mt-2 text-[13px] text-dim stencil">
              {summary.faction} — SECTOR {String(summary.depth).padStart(2, "0")}
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {[
                ["KILLS", String(summary.kills), "#ff4655"],
                ["CREDITS BANKED", `+${summary.creditsEarned}`, "#e8c23c"],
                ["RESCUED", String(summary.rescued), "#3ad8e8"],
                ["UPTIME", `${Math.floor(summary.timeSec / 60)}m ${summary.timeSec % 60}s`, "#4ef08a"],
              ].map(([k, v, c]) => (
                <div key={k} className="hud-panel chamfer-sm py-2.5">
                  <div className="font-display text-lg font-bold" style={{ color: c }}>{v}</div>
                  <div className="text-[9px] stencil text-dim">{k}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[12px] text-dim border-l-2 border-phos/40 pl-3">
              FIELD NOTE — credits stay banked at Command. Spend them in the Armory before your next drop.
            </div>
            <button onClick={toTitle} className="btn-mil chamfer w-full mt-6 py-3.5 bg-blood text-black font-black text-sm tracking-widest">
              RETURN TO COMMAND
            </button>
          </div>
        </div>
      )}

      {/* ======= SECTOR CLEARED ======= */}
      {screen === "clear" && summary && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(3,14,10,0.66)]">
          <div className="hud-panel chamfer p-8 w-[520px] rise-in">
            <div className="font-display text-[11px] stencil text-phos">EXTRACTION CONFIRMED — DROPSHIP AWAY</div>
            <h2 className="font-display text-4xl font-black tracking-widest text-phos mt-1" style={{ textShadow: "0 0 24px rgba(78,240,138,0.5)" }}>
              SECTOR {String(summary.depth).padStart(2, "0")} CLEARED
            </h2>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[
                ["EXTRACTION BONUS", `+${summary.creditsEarned}c`, "#e8c23c"],
                ["HOSTILES DOWN", String(summary.kills), "#ff4655"],
                ["ABDUCTEES SAVED", String(summary.rescued), "#3ad8e8"],
              ].map(([k, v, c]) => (
                <div key={k} className="hud-panel chamfer-sm py-2.5">
                  <div className="font-display text-lg font-bold" style={{ color: c }}>{v}</div>
                  <div className="text-[9px] stencil text-dim">{k}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 hud-panel chamfer-sm p-3 flex items-center gap-3 sweepbar">
              <div className="w-10 h-10 chamfer-sm shrink-0" style={{ background: nextFaction.accentHex }} />
              <div>
                <div className="text-[10px] stencil text-dim">NEXT BREACH TARGET</div>
                <div className="font-display text-[15px] font-bold text-bone">{nextFaction.label}</div>
                <div className="text-[10px] stencil" style={{ color: nextFaction.accentHex }}>{nextFaction.sub}</div>
              </div>
            </div>
            <button onClick={next} className="btn-mil chamfer w-full mt-6 py-3.5 bg-phos text-black font-black text-sm tracking-widest">
              BREACH NEXT SECTOR ▸
            </button>
          </div>
        </div>
      )}

      {/* ======= VICTORY ======= */}
      {screen === "victory" && summary && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(14,10,2,0.7)]">
          <div className="hud-panel chamfer p-8 w-[540px] rise-in" style={{ borderColor: "rgba(232,194,60,0.5)" }}>
            <div className="font-display text-[11px] stencil text-[#e8c23c]">FLAGSHIP CORE PURGED — TERRAN IDF COMMENDATION</div>
            <h2 className="font-display text-4xl font-black tracking-widest mt-1" style={{ color: "#e8c23c", textShadow: "0 0 28px rgba(232,194,60,0.55)" }}>
              CAMPAIGN COMPLETE
            </h2>
            <p className="mt-3 text-[14px] text-bone leading-snug">
              The Ascendant is dead and the Dark Fleet flagship burns. Command is spinning up
              fresh breach vectors — deeper sectors, stranger hosts, better pay.
            </p>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {[
                ["SECTORS", String(summary.depth), "#4ef08a"],
                ["KILLS", String(summary.kills), "#ff4655"],
                ["CREDITS", `+${summary.creditsEarned}`, "#e8c23c"],
                ["RESCUED", String(summary.rescued), "#3ad8e8"],
              ].map(([k, v, c]) => (
                <div key={k} className="hud-panel chamfer-sm py-2.5">
                  <div className="font-display text-lg font-bold" style={{ color: c }}>{v}</div>
                  <div className="text-[9px] stencil text-dim">{k}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={next} className="btn-mil chamfer flex-1 py-3 bg-[#e8c23c] text-black font-black text-sm">KEEP RAIDING — ENDLESS</button>
              <button onClick={toTitle} className="btn-mil chamfer flex-1 py-3 bg-panel2 text-phos border border-phos/40 font-bold text-sm">RETURN TO COMMAND</button>
            </div>
          </div>
        </div>
      )}

      {/* ======= TITLE / COMMAND ======= */}
      {screen === "title" && (
        <div className="absolute inset-0 overflow-y-auto">
          <div className="min-h-full flex">
            {/* LEFT — identity + briefing + deploy */}
            <div className="relative flex-1 flex flex-col justify-center px-10 lg:px-16 py-8">
              <div className="absolute left-0 right-0 bottom-0 h-[38vh] gridfloor opacity-60 pointer-events-none" />
              <div className="relative max-w-[620px] slide-in-l">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-phos blink" />
                  <span className="font-display text-[11px] stencil text-phos tracking-[0.3em]">TERRAN IDF — DEEP STRIKE DIRECTIVE 7C</span>
                </div>
                <h1 className="glitch-title font-display text-6xl lg:text-7xl font-black tracking-wide text-bone mt-3 leading-none">
                  XENO<span className="text-phos">BREACH</span>
                </h1>
                <p className="mt-4 text-[15px] text-dim leading-relaxed max-w-[540px]">
                  Lead a four-agent strike team through the seized stations, hives and flagships of
                  humanity's enemies — <span className="text-amber">Rusthalo pirates</span>,{" "}
                  <span className="text-ice">machine foundries</span>,{" "}
                  <span className="text-[#e8c23c]">HelixCorp compounds</span>,{" "}
                  <span className="text-bone">Annunaki ruins</span>,{" "}
                  <span className="text-[#b0d84a]">Cyakahrr warrens</span> and the{" "}
                  <span className="text-blood">Dark Fleet</span> itself. Free the abductees, seize the
                  salvage, find the gate. Every agent carries their arsenal built in — they only ever
                  need more <span className="text-phos">ammo</span> and{" "}
                  <span className="text-ice">recharge</span>.
                </p>

                {/* controls */}
                <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-1.5 text-[13px] text-dim max-w-[520px]">
                  <span><span className="keycap mr-2">W A S D</span>move & strafe</span>
                  <span><span className="keycap mr-2">MOUSE / ◄ ►</span>look</span>
                  <span><span className="keycap mr-2">LMB / SPACE</span>fire system</span>
                  <span><span className="keycap mr-2">RMB / R</span>special ability</span>
                  <span><span className="keycap mr-2">1 – 4</span>switch agent</span>
                  <span><span className="keycap mr-2">E</span>doors · prisoners · gate</span>
                  <span><span className="keycap mr-2">TAB / M</span>sector map</span>
                  <span><span className="keycap mr-2">P / ESC</span>hold operation</span>
                </div>

                <button onClick={deploy} className="btn-mil chamfer mt-8 px-12 py-4 bg-phos text-black font-black text-lg tracking-[0.25em] inline-flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 2 L16 9 L3 16 Z" fill="#04070c" /></svg>
                  DEPLOY STRIKE TEAM
                </button>
                <div className="mt-3 text-[11px] stencil text-dim">
                  {meta.runs > 0 ? `${meta.runs} OPS LOGGED · BEST: SECTOR ${meta.bestDepth} · ${meta.wins} CAMPAIGNS WON` : "FIRST DROP — COMMAND IS WATCHING, CMDR."}
                </div>
              </div>
            </div>

            {/* RIGHT — armory + roster */}
            <div className="relative w-[440px] shrink-0 border-l border-line bg-[rgba(6,12,18,0.88)] backdrop-blur-sm px-6 py-6 overflow-y-auto rise-in">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold stencil text-phos">COMMAND ARMORY</h2>
                <div className="flex items-center gap-1.5 hud-panel chamfer-sm px-2.5 py-1">
                  <IconCredit s={12} />
                  <span className="font-display text-sm font-bold text-[#e8c23c]">{meta.credits}</span>
                </div>
              </div>
              <div className="text-[10px] stencil text-dim mt-0.5">PERMANENT REQUISITIONS — SURVIVE OR DON'T, THESE STICK</div>

              <div className="mt-4 space-y-2">
                {UPGRADES.map((u) => {
                  const rank = upgradeRank(meta, u.id);
                  const cost = rank >= MAX_RANK ? null : UPGRADE_COSTS[rank];
                  const afford = cost !== null && meta.credits >= cost;
                  return (
                    <div key={u.id} className="hud-panel chamfer-sm px-3 py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-[11px] font-bold text-bone stencil">{u.name}</span>
                          <span className="flex gap-[3px]">
                            {Array.from({ length: MAX_RANK }).map((_, i) => (
                              <span key={i} className="w-2 h-2 rotate-45" style={{ background: i < rank ? "#4ef08a" : "#1d3a4a" }} />
                            ))}
                          </span>
                        </div>
                        <div className="text-[11px] text-dim leading-tight">{u.desc}</div>
                      </div>
                      <button
                        onClick={() => buy(u.id)}
                        disabled={cost === null || !afford}
                        className={`btn-mil chamfer-sm px-2.5 py-1.5 text-[10px] font-bold shrink-0 ${afford ? "bg-phos text-black" : "bg-panel2 text-dim border border-line"}`}
                      >
                        {cost === null ? "MAX" : <span className="flex items-center gap-1"><IconCredit s={9} c={afford ? "#04070c" : "#5f8a80"} />{cost}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>

              <h3 className="font-display text-[12px] font-bold stencil text-phos mt-6">STRIKE TEAM ROSTER</h3>
              <div className="mt-2 space-y-1.5">
                {AGENTS.map((a) => (
                  <div key={a.id} className="hud-panel chamfer-sm px-3 py-2 flex items-center gap-3">
                    <div className="w-8 h-8 chamfer-sm flex items-center justify-center font-display text-[11px] font-bold text-black shrink-0" style={{ background: a.color }}>
                      {a.role.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-[11px] font-bold text-bone">{a.name} <span className="stencil text-[9px]" style={{ color: a.color }}>· {a.role}</span></div>
                      <div className="text-[10px] text-dim leading-tight">{a.weapon.name} — {a.special.name}</div>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="font-display text-[12px] font-bold stencil text-phos mt-6">THREAT BOARD</h3>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {FACTIONS.map((f, i) => (
                  <div key={f.id} className="hud-panel chamfer-sm px-2 py-1.5 flex items-center gap-2">
                    <span className="w-3 h-3 shrink-0 rotate-45" style={{ background: f.accentHex }} />
                    <div className="min-w-0">
                      <div className="text-[10px] font-display font-bold text-bone truncate">{f.label}</div>
                      <div className="text-[8.5px] stencil text-dim truncate">DEPTH {(i % 6) + 1}{i >= 6 ? `+${Math.floor(i / 6) * 6}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pb-2 text-[10px] stencil text-dim text-center">
                KILLS · SALVAGE · BOUNTIES PAY IN REQUISITION CREDITS
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
