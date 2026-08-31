// ============ Tiny WebAudio synth — all SFX procedural ============

type OscType = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambientNodes: AudioNode[] = [];
  muted = false;

  unlock(): void {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.42;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.42, this.ctx.currentTime, 0.05);
    }
  }

  private tone(f0: number, f1: number, dur: number, type: OscType, vol: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, delay = 0, q = 0.8): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(filterFreq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreq * 0.25), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  shoot(kind: "pulse" | "pistol" | "scatter" | "zap" | "knife"): void {
    switch (kind) {
      case "pulse":
        this.tone(920, 240, 0.09, "square", 0.16);
        this.noise(0.06, 0.08, 3400);
        break;
      case "pistol":
        this.tone(560, 180, 0.08, "square", 0.14);
        break;
      case "scatter":
        this.noise(0.22, 0.3, 1600, 0, 0.4);
        this.tone(200, 70, 0.16, "sawtooth", 0.14);
        break;
      case "zap":
        this.tone(1500, 180, 0.13, "sawtooth", 0.13);
        this.noise(0.08, 0.06, 5000);
        break;
      case "knife":
        this.noise(0.09, 0.12, 2400);
        break;
    }
  }

  enemyShot(): void {
    this.tone(340, 120, 0.1, "sawtooth", 0.08);
  }
  hit(): void {
    this.tone(1200, 900, 0.045, "square", 0.1);
  }
  kill(): void {
    this.tone(300, 40, 0.25, "sawtooth", 0.16);
    this.noise(0.2, 0.14, 1400);
  }
  hurt(): void {
    this.tone(180, 60, 0.18, "square", 0.2);
    this.noise(0.12, 0.1, 900);
  }
  agentDown(): void {
    this.tone(320, 50, 0.7, "sawtooth", 0.22);
    this.tone(160, 40, 0.9, "square", 0.14, 0.1);
  }
  pickup(kind: "ammo" | "energy" | "med" | "credits" | "artifact"): void {
    switch (kind) {
      case "ammo":
        this.tone(420, 640, 0.07, "square", 0.12);
        break;
      case "energy":
        this.tone(500, 900, 0.09, "sine", 0.14);
        break;
      case "med":
        this.tone(660, 990, 0.12, "sine", 0.14);
        this.tone(990, 1320, 0.12, "sine", 0.1, 0.1);
        break;
      case "credits":
        this.tone(880, 1760, 0.09, "triangle", 0.16);
        this.tone(1320, 2200, 0.08, "triangle", 0.1, 0.07);
        break;
      case "artifact":
        this.tone(440, 880, 0.3, "sine", 0.16);
        this.tone(660, 1320, 0.3, "sine", 0.12, 0.1);
        this.tone(880, 1760, 0.4, "sine", 0.1, 0.2);
        break;
    }
  }
  door(): void {
    this.noise(0.28, 0.14, 700);
    this.tone(90, 60, 0.3, "square", 0.1);
  }
  locked(): void {
    this.tone(220, 220, 0.08, "square", 0.12);
    this.tone(160, 160, 0.12, "square", 0.12, 0.12);
  }
  rescue(): void {
    this.tone(520, 780, 0.12, "sine", 0.16);
    this.tone(780, 1040, 0.14, "sine", 0.14, 0.12);
    this.tone(1040, 1560, 0.2, "sine", 0.12, 0.26);
  }
  explosion(): void {
    this.noise(0.5, 0.4, 900, 0, 0.3);
    this.tone(120, 30, 0.45, "sawtooth", 0.24);
  }
  shockwave(): void {
    this.noise(0.35, 0.3, 1200, 0, 0.4);
    this.tone(90, 40, 0.3, "square", 0.2);
  }
  emp(): void {
    this.tone(2200, 120, 0.5, "sawtooth", 0.14);
    this.tone(1100, 60, 0.6, "sine", 0.14, 0.05);
    this.noise(0.4, 0.1, 4000);
  }
  stun(): void {
    this.tone(1400, 300, 0.2, "square", 0.07);
  }
  alarm(): void {
    this.tone(620, 620, 0.16, "square", 0.12);
    this.tone(460, 460, 0.16, "square", 0.12, 0.2);
    this.tone(620, 620, 0.16, "square", 0.12, 0.4);
  }
  heal(): void {
    this.tone(600, 1200, 0.25, "sine", 0.12);
  }
  trap(): void {
    this.noise(0.18, 0.24, 2000);
    this.tone(260, 90, 0.15, "square", 0.16);
  }
  extract(): void {
    this.tone(392, 392, 0.14, "triangle", 0.16);
    this.tone(523, 523, 0.14, "triangle", 0.16, 0.14);
    this.tone(659, 659, 0.14, "triangle", 0.16, 0.28);
    this.tone(784, 784, 0.4, "triangle", 0.18, 0.42);
  }
  defeat(): void {
    this.tone(300, 280, 0.3, "sawtooth", 0.16);
    this.tone(240, 220, 0.35, "sawtooth", 0.16, 0.28);
    this.tone(160, 60, 0.8, "sawtooth", 0.18, 0.58);
  }
  ui(): void {
    this.tone(700, 900, 0.05, "square", 0.07);
  }
  deploy(): void {
    this.tone(200, 800, 0.25, "sawtooth", 0.12);
    this.noise(0.3, 0.1, 2000);
  }

  ambientStart(): void {
    if (!this.ctx || !this.master || this.ambientNodes.length) return;
    const mk = (f: number, v: number) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = v;
      o.connect(g).connect(this.master!);
      o.start();
      this.ambientNodes.push(o, g);
    };
    mk(52, 0.035);
    mk(55.3, 0.03);
    mk(104, 0.012);
  }
  ambientStop(): void {
    for (const n of this.ambientNodes) {
      try {
        if (n instanceof OscillatorNode) n.stop();
        n.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.ambientNodes = [];
  }
}

export const sfx = new Sfx();
