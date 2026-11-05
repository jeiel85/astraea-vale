/**
 * Astraea Vale — runtime-synthesized audio (Web Audio API only; the game ships no audio files).
 *
 *  1. Public types + persisted settings. Importing this module is side-effect free apart from a
 *     guarded localStorage read: no window / document / AudioContext access happens at load, so it
 *     is safe under Node tests. The AudioContext is created lazily by `audio.unlock()`.
 *  2. Engine: one AudioContext; voices → music / sfx buses (+ reverb sends) → master → high-shelf
 *     → compressor → speakers. The reverb is a small Schroeder network (allpass diffusers + damped
 *     feedback combs), no convolution.
 *  3. Synthesis primitives (tone / noise / fm) shared by sound effects and instruments.
 *  4. SFX table: one recipe per SfxName.
 *  5. Music: instruments, drum kit, pattern "parts", track data and a lookahead 16th-step sequencer.
 *  6. The public `audio` facade. No entry point throws; failures are logged once via console.warn.
 */

export type SfxName =
  | 'till' | 'water' | 'plant' | 'harvest' | 'coin' | 'pickup'
  | 'swing1' | 'swing2' | 'swing3' | 'hit' | 'crit' | 'deflect'
  | 'dash' | 'magic' | 'enemyDie' | 'hurt' | 'heal' | 'potion'
  | 'telegraph' | 'bossRoar' | 'explosion' | 'ore' | 'stairs'
  | 'blip' | 'confirm' | 'cancel' | 'error' | 'fanfare' | 'levelUp'
  | 'weaveStar' | 'weaveSuccess' | 'weaveFail' | 'splash'
  | 'moo' | 'quack' | 'door' | 'sleep' | 'heart' | 'shutter';

export type MusicTrack =
  | 'none' | 'title' | 'farmDay' | 'farmNight' | 'village'
  | 'festival' | 'mine' | 'boss' | 'eclipse';

export interface AudioSettings { music: number; sfx: number; muted: boolean } // music/sfx in 0..1

// ─────────────────────────────────────────────────────────────────────────────
// 1. Settings
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'astraea-vale/audio';
const DEFAULT_SETTINGS: Readonly<AudioSettings> = { music: 0.5, sfx: 0.7, muted: false };

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const finiteOr = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const warned = new Set<string>();
/** Log a problem once per key (the scheduler runs every 25 ms; never spam the console). */
function warnOnce(key: string, err?: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  if (typeof console !== 'undefined') console.warn(`[audio] ${key}`, err ?? '');
}

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null; // some sandboxed iframes throw on access; persistence is then simply unavailable
  }
}

function loadSettings(): AudioSettings {
  const out: AudioSettings = { ...DEFAULT_SETTINGS };
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY);
    if (!raw) return out;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const r = parsed as Record<string, unknown>;
      out.music = clamp(finiteOr(r.music, out.music), 0, 1);
      out.sfx = clamp(finiteOr(r.sfx, out.sfx), 0, 1);
      if (typeof r.muted === 'boolean') out.muted = r.muted;
    }
  } catch (err) {
    warnOnce('saved audio settings unreadable; using defaults', err);
  }
  return out;
}

const settings: AudioSettings = loadSettings();

function saveSettings(): void {
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    warnOnce('could not persist audio settings', err); // quota / private mode: settings still apply
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Engine
// ─────────────────────────────────────────────────────────────────────────────

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  musicBus: GainNode;
  musicSend: GainNode;
  sfxBus: GainNode;
  sfxSend: GainNode;
  noise: AudioBuffer;
}

let engine: Engine | null = null;
let engineFailed = false;
let unlocked = false;

/** Perceptual slider curve: 0.5 on the slider ≈ -12 dB. */
const curve = (v: number): number => v * v;
const MUSIC_LEVEL = 0.9;
const SFX_LEVEL = 1.8; // effects sit ~5 dB above the music bed at default sliders

function settle(p: Promise<unknown> | undefined, what: string): void {
  if (p && typeof p.then === 'function') p.then(undefined, (err: unknown) => warnOnce(what, err));
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

function connectPanned(ctx: AudioContext, src: AudioNode, dst: AudioNode, pan: number): void {
  if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    src.connect(p);
    p.connect(dst);
  } else {
    src.connect(dst);
  }
}

function biquad(ctx: AudioContext, type: BiquadFilterType, freq: number, q?: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  if (q !== undefined) f.Q.value = q;
  return f;
}

/** Schroeder allpass (diffuser) built from nodes. Delays in a cycle must be ≥ one render quantum. */
function allpass(ctx: AudioContext, input: AudioNode, delay: number, g: number): AudioNode {
  const sum = ctx.createGain();
  const dl = ctx.createDelay(0.1);
  dl.delayTime.value = delay;
  const fb = ctx.createGain();
  fb.gain.value = g;
  const ff = ctx.createGain();
  ff.gain.value = -g;
  const out = ctx.createGain();
  input.connect(sum);
  sum.connect(dl);
  dl.connect(fb);
  fb.connect(sum);
  sum.connect(ff);
  ff.connect(out);
  dl.connect(out);
  return out;
}

function buildReverb(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
  const hp = biquad(ctx, 'highpass', 220);
  const lp = biquad(ctx, 'lowpass', 5200);
  input.connect(hp);
  hp.connect(lp);
  const diffused = allpass(ctx, allpass(ctx, lp, 0.0049, 0.6), 0.0077, 0.55);
  const ret = ctx.createGain();
  ret.gain.value = 0.16;
  ret.connect(output);
  const combs: Array<[number, number]> = [[0.0297, -0.8], [0.0371, 0.8], [0.0411, -0.35], [0.0437, 0.35]];
  for (const [delay, pan] of combs) {
    const dl = ctx.createDelay(0.2);
    dl.delayTime.value = delay;
    // Q is in dB for lowpass: -3 dB ≈ Butterworth (no resonant peak), keeping loop gain < 1 at every
    // frequency. The default Q (1 dB) peaks at ~1.25× and would make this feedback loop unstable.
    const damp = biquad(ctx, 'lowpass', 2800, -3);
    const fb = ctx.createGain();
    fb.gain.value = 0.81; // ≈1.3 s tail, highs decay faster through the damping filter
    diffused.connect(dl);
    dl.connect(damp);
    damp.connect(fb);
    fb.connect(dl);
    connectPanned(ctx, damp, ret, pan);
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function applyLevels(e: Engine, immediate: boolean): void {
  const now = e.ctx.currentTime;
  const set = (p: AudioParam, v: number): void => {
    if (immediate) {
      p.value = v;
    } else {
      p.cancelScheduledValues(now);
      p.setTargetAtTime(v, now, 0.03);
    }
  };
  const music = curve(settings.music) * MUSIC_LEVEL;
  const sfx = curve(settings.sfx) * SFX_LEVEL;
  set(e.master.gain, settings.muted ? 0 : 1);
  set(e.musicBus.gain, music);
  set(e.musicSend.gain, music);
  set(e.sfxBus.gain, sfx);
  set(e.sfxSend.gain, sfx);
}

function createEngine(): Engine | null {
  const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    ctx = new Ctor(); // older engines reject the options bag; a throw here propagates to unlock()
  }
  try {
    const master = ctx.createGain();
    const shelf = biquad(ctx, 'highshelf', 7000);
    shelf.gain.value = -4; // tame fizz: warmer, less fatiguing
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    master.connect(shelf);
    shelf.connect(comp);
    comp.connect(ctx.destination);
    const verbIn = ctx.createGain();
    buildReverb(ctx, verbIn, master);
    const bus = (to: AudioNode): GainNode => {
      const n = ctx.createGain();
      n.connect(to);
      return n;
    };
    const e: Engine = {
      ctx, master,
      musicBus: bus(master), musicSend: bus(verbIn),
      sfxBus: bus(master), sfxSend: bus(verbIn),
      noise: makeNoise(ctx),
    };
    applyLevels(e, true);
    return e;
  } catch (err) {
    settle(ctx.close(), 'closing failed AudioContext');
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Synthesis primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Where a voice plays: dry path, reverb send, shared noise; `end` tracks the latest stop time. */
interface Dest { ctx: AudioContext; dry: AudioNode; wet: AudioNode; noise: AudioBuffer; end: number }

const SILENT = 0.0001;

/** Linear attack → optional hold → exponential decay to silence after `dur` seconds. */
function envelope(ctx: AudioContext, t: number, a: number, hold: number, dur: number, peak: number): GainNode {
  const g = ctx.createGain();
  const p = Math.max(peak, SILENT * 2);
  // A GainNode passes 1.0 until its first automation event, and sources start with sub-sample
  // accuracy, so the frame just before `t` would leak one full-scale sample (an audible click).
  // Pin the gain to 0 from the start of the timeline; events in the past are valid.
  g.gain.setValueAtTime(0, 0);
  g.gain.setValueAtTime(SILENT, t);
  g.gain.linearRampToValueAtTime(p, t + a);
  if (hold > 0) g.gain.setValueAtTime(p, t + a + hold);
  g.gain.exponentialRampToValueAtTime(SILENT, t + a + hold + dur);
  return g;
}

function route(d: Dest, node: AudioNode, wet: number, pan: number): void {
  connectPanned(d.ctx, node, d.dry, pan);
  if (wet > 0) {
    const send = d.ctx.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(d.wet);
  }
}

function sweepFilter(
  ctx: AudioContext, input: AudioNode, type: BiquadFilterType,
  f: number, to: number | undefined, t: number, glide: number, q: number | undefined,
): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.Q.value = q ?? (type === 'bandpass' ? 1 : 0);
  b.frequency.setValueAtTime(Math.max(20, f), t);
  if (to !== undefined) b.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + Math.max(0.005, glide));
  input.connect(b);
  return b;
}

interface ToneOpts {
  t: number; f: number; type?: OscillatorType;
  to?: number; glide?: number; // exponential pitch glide
  a?: number; hold?: number; dur: number; g: number;
  wet?: number; pan?: number; detune?: number;
  cut?: number; cutTo?: number; cutGlide?: number; q?: number; ftype?: BiquadFilterType;
  vib?: [rate: number, cents: number, delay: number];
}

function tone(d: Dest, o: ToneOpts): void {
  const { ctx } = d;
  const a = o.a ?? 0.004;
  const hold = o.hold ?? 0;
  const end = o.t + a + hold + o.dur;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, o.t);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), o.t + (o.glide ?? end - o.t));
  if (o.detune) osc.detune.setValueAtTime(o.detune, o.t);
  if (o.vib) {
    const [rate, cents, delay] = o.vib;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, o.t);
    depth.gain.setValueAtTime(0, o.t + delay);
    depth.gain.linearRampToValueAtTime(cents, o.t + delay + 0.25);
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start(o.t);
    lfo.stop(end + 0.05);
  }
  let node: AudioNode = osc;
  if (o.cut !== undefined) {
    node = sweepFilter(ctx, osc, o.ftype ?? 'lowpass', o.cut, o.cutTo, o.t, o.cutGlide ?? end - o.t, o.q);
  }
  const env = envelope(ctx, o.t, a, hold, o.dur, o.g);
  node.connect(env);
  route(d, env, o.wet ?? 0.15, o.pan ?? 0);
  osc.start(o.t);
  osc.stop(end + 0.05);
  if (end > d.end) d.end = end;
}

interface NoiseOpts {
  t: number; dur: number; g: number; f: number;
  type?: BiquadFilterType; to?: number; glide?: number; q?: number;
  a?: number; hold?: number; wet?: number; pan?: number;
}

function noise(d: Dest, o: NoiseOpts): void {
  const { ctx } = d;
  const a = o.a ?? 0.003;
  const hold = o.hold ?? 0;
  const end = o.t + a + hold + o.dur;
  const src = ctx.createBufferSource();
  src.buffer = d.noise;
  src.loop = true;
  const filt = sweepFilter(ctx, src, o.type ?? 'bandpass', o.f, o.to, o.t, o.glide ?? end - o.t, o.q);
  const env = envelope(ctx, o.t, a, hold, o.dur, o.g);
  filt.connect(env);
  route(d, env, o.wet ?? 0.1, o.pan ?? 0);
  src.start(o.t, Math.random() * Math.max(0, d.noise.duration - 0.5));
  src.stop(end + 0.05);
  if (end > d.end) d.end = end;
}

interface FmOpts {
  t: number; f: number; ratio: number; index: number; indexDur?: number;
  a?: number; hold?: number; dur: number; g: number; wet?: number; pan?: number;
}

/** Two-operator FM: bright attack that mellows (e-piano, bells, celesta shimmer). */
function fm(d: Dest, o: FmOpts): void {
  const { ctx } = d;
  const a = o.a ?? 0.004;
  const hold = o.hold ?? 0;
  const end = o.t + a + hold + o.dur;
  const car = ctx.createOscillator();
  car.frequency.setValueAtTime(o.f, o.t);
  const mod = ctx.createOscillator();
  mod.frequency.setValueAtTime(o.f * o.ratio, o.t);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(o.f * o.index, o.t);
  depth.gain.exponentialRampToValueAtTime(Math.max(0.01, o.f * o.index * 0.12), o.t + (o.indexDur ?? o.dur * 0.5));
  mod.connect(depth);
  depth.connect(car.frequency);
  const env = envelope(ctx, o.t, a, hold, o.dur, o.g);
  car.connect(env);
  route(d, env, o.wet ?? 0.25, o.pan ?? 0);
  car.start(o.t);
  mod.start(o.t);
  car.stop(end + 0.05);
  mod.stop(end + 0.05);
  if (end > d.end) d.end = end;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sound effects
// ─────────────────────────────────────────────────────────────────────────────

/** (destination, start time, pitch multiplier). Frequencies are scaled by `p`. */
type SfxFn = (d: Dest, t: number, p: number) => void;

function chime(d: Dest, t: number, f: number, g: number, dur: number, wet = 0.35): void {
  tone(d, { t, f, type: 'triangle', a: 0.002, dur, g, wet });
  tone(d, { t, f: f * 2, a: 0.002, dur: dur * 0.5, g: g * 0.35, wet });
}

function impact(d: Dest, t: number, p: number, g: number): void {
  noise(d, { t, dur: 0.09, g: 0.38 * g, type: 'lowpass', f: 3200 * p, to: 500, wet: 0.05 });
  tone(d, { t, f: 190 * p, to: 58 * p, glide: 0.09, dur: 0.13, g: 0.42 * g, wet: 0.03 });
  tone(d, { t, f: 1100 * p, type: 'triangle', a: 0.001, dur: 0.025, g: 0.07 * g, wet: 0 });
}

/** Struck-bar partials (inharmonic) → metallic ping. */
function metal(d: Dest, t: number, f: number, g: number, dur: number): void {
  const partials: Array<[number, number]> = [[1, 1], [2.756, 0.5], [5.404, 0.28], [8.933, 0.15]];
  for (const [ratio, amp] of partials) {
    tone(d, { t, f: f * ratio, a: 0.001, dur: dur / Math.sqrt(ratio), g: g * amp, wet: 0.35 });
  }
}

function swoosh(d: Dest, t: number, p: number, from: number, to: number, dur: number, g: number, q: number): void {
  noise(d, { t, a: dur * 0.3, dur: dur * 0.7, g, type: 'bandpass', f: from * p, to: to * p, glide: dur, q, wet: 0.08 });
}

function brassTone(d: Dest, t: number, f: number, len: number, v: number): void {
  const hold = Math.max(0, len - 0.05);
  for (const det of [-6, 6]) {
    tone(d, {
      t, f, type: 'sawtooth', a: 0.02, hold, dur: 0.2, g: 0.026 * v, detune: det,
      cut: f * 6, cutTo: f * 2.2, cutGlide: 0.25, wet: 0.3, pan: det / 30,
    });
  }
}

const SFX: Record<SfxName, SfxFn> = {
  till: (d, t, p) => {
    tone(d, { t, f: 150 * p, to: 55 * p, glide: 0.1, dur: 0.16, g: 0.45, wet: 0.05 });
    noise(d, { t, dur: 0.14, g: 0.32, type: 'lowpass', f: 1100 * p, to: 300, wet: 0.05 });
    noise(d, { t: t + 0.035, dur: 0.12, g: 0.1, type: 'bandpass', f: 2600 * p, q: 1.5, wet: 0.1 });
  },
  water: (d, t, p) => {
    noise(d, { t, a: 0.06, dur: 0.42, g: 0.13, type: 'bandpass', f: 2800 * p, to: 1800 * p, q: 0.6, wet: 0.2 });
    for (let i = 0; i < 4; i++) {
      const f = (520 + Math.random() * 380) * p;
      tone(d, { t: t + 0.06 + i * 0.075 + Math.random() * 0.02, f, to: f * 1.7, glide: 0.045, dur: 0.06, g: 0.09, wet: 0.25 });
    }
  },
  plant: (d, t, p) => {
    noise(d, { t, dur: 0.08, g: 0.16, type: 'lowpass', f: 700 * p, wet: 0.05 });
    tone(d, { t: t + 0.04, f: 300 * p, to: 620 * p, glide: 0.07, dur: 0.14, g: 0.17, wet: 0.2 });
    tone(d, { t: t + 0.12, f: 784 * p, type: 'triangle', dur: 0.2, g: 0.07, wet: 0.35 });
  },
  harvest: (d, t, p) => {
    noise(d, { t, dur: 0.05, g: 0.12, type: 'bandpass', f: 1500 * p, q: 1.2, wet: 0.05 });
    [1047, 1319, 1568, 2093].forEach((f, i) => chime(d, t + 0.03 + i * 0.055, f * p, 0.08, 0.3, 0.4));
  },
  coin: (d, t, p) => {
    chime(d, t, 988 * p, 0.11, 0.09, 0.3);
    chime(d, t + 0.075, 1319 * p, 0.12, 0.42, 0.35);
  },
  pickup: (d, t, p) => {
    tone(d, { t, f: 620 * p, to: 1240 * p, glide: 0.07, a: 0.003, dur: 0.12, g: 0.2, wet: 0.2 });
    tone(d, { t, f: 1240 * p, to: 2480 * p, glide: 0.07, type: 'triangle', a: 0.003, dur: 0.08, g: 0.04, wet: 0.2 });
  },
  swing1: (d, t, p) => swoosh(d, t, p, 700, 2600, 0.16, 0.26, 1.4),
  swing2: (d, t, p) => {
    swoosh(d, t, p, 800, 3200, 0.18, 0.26, 1.3);
    tone(d, { t, f: 300 * p, to: 520 * p, glide: 0.12, dur: 0.1, g: 0.03, wet: 0.05 });
  },
  swing3: (d, t, p) => {
    swoosh(d, t, p, 450, 2400, 0.26, 0.34, 1);
    noise(d, { t: t + 0.02, dur: 0.2, g: 0.16, type: 'lowpass', f: 500 * p, wet: 0.05 });
    tone(d, { t: t + 0.03, f: 140 * p, to: 70 * p, glide: 0.15, dur: 0.18, g: 0.2, wet: 0.03 });
  },
  hit: (d, t, p) => impact(d, t, p, 1),
  crit: (d, t, p) => {
    impact(d, t, p, 1.15);
    tone(d, { t: t + 0.01, f: 2093 * p, a: 0.002, dur: 0.35, g: 0.1, wet: 0.45 });
    tone(d, { t: t + 0.01, f: 3322 * p, a: 0.002, dur: 0.25, g: 0.05, wet: 0.45 });
  },
  deflect: (d, t, p) => {
    metal(d, t, 1650 * p, 0.16, 0.5);
    noise(d, { t, a: 0.001, dur: 0.025, g: 0.15, type: 'highpass', f: 4000 * p, wet: 0.1 });
  },
  dash: (d, t, p) => {
    noise(d, { t, a: 0.012, dur: 0.17, g: 0.28, type: 'bandpass', f: 3200 * p, to: 480 * p, glide: 0.17, q: 1.1, wet: 0.08 });
    tone(d, { t, f: 520 * p, to: 160 * p, glide: 0.15, dur: 0.15, g: 0.05, wet: 0.05 });
  },
  magic: (d, t, p) => {
    [880, 1109, 1319, 1760, 2217].forEach((f, i) =>
      fm(d, { t: t + i * 0.045, f: f * p, ratio: 2, index: 0.7, a: 0.003, dur: 0.32, g: 0.055, wet: 0.6, pan: (i - 2) * 0.15 }));
    noise(d, { t, a: 0.09, dur: 0.45, g: 0.03, type: 'highpass', f: 6000, wet: 0.6 });
  },
  enemyDie: (d, t, p) => {
    noise(d, { t, dur: 0.3, g: 0.22, type: 'bandpass', f: 1400 * p, to: 260 * p, q: 0.8, wet: 0.25 });
    tone(d, { t, f: 620 * p, to: 140 * p, glide: 0.25, type: 'triangle', dur: 0.26, g: 0.11, wet: 0.2 });
    chime(d, t + 0.12, 1568 * p, 0.045, 0.3, 0.5);
  },
  hurt: (d, t, p) => {
    tone(d, { t, f: 440 * p, to: 170 * p, glide: 0.18, type: 'sawtooth', dur: 0.2, g: 0.13, cut: 1500 * p, wet: 0.08 });
    noise(d, { t, dur: 0.08, g: 0.22, type: 'lowpass', f: 1300 * p, wet: 0.05 });
    tone(d, { t, f: 160 * p, to: 70 * p, glide: 0.08, dur: 0.1, g: 0.25, wet: 0 });
  },
  heal: (d, t, p) => {
    [523, 659, 784, 1047].forEach((f, i) => chime(d, t + i * 0.07, f * p, 0.07, 0.45, 0.5));
    noise(d, { t: t + 0.05, a: 0.12, dur: 0.45, g: 0.022, type: 'highpass', f: 5500, wet: 0.6 });
  },
  potion: (d, t, p) => {
    [[300, 0], [360, 0.09], [430, 0.18]].forEach(([f, dt]) =>
      tone(d, { t: t + dt, f: f * p, to: f * p * 1.7, glide: 0.05, dur: 0.08, g: 0.15, wet: 0.15 }));
    noise(d, { t: t + 0.2, a: 0.05, dur: 0.35, g: 0.03, type: 'highpass', f: 4000 * p, wet: 0.3 });
    chime(d, t + 0.28, 1568 * p, 0.04, 0.3, 0.5);
  },
  telegraph: (d, t, p) => {
    for (const dt of [0, 0.2]) {
      tone(d, { t: t + dt, f: 660 * p, type: 'triangle', a: 0.03, hold: 0.07, dur: 0.12, g: 0.1, wet: 0.2 });
      tone(d, { t: t + dt, f: 990 * p, a: 0.03, hold: 0.07, dur: 0.12, g: 0.045, wet: 0.2 });
    }
  },
  bossRoar: (d, t, p) => {
    const layers: Array<[number, number]> = [[55, -12], [55, 12], [82.4, 0]];
    for (const [f, det] of layers) {
      tone(d, {
        t, f: f * p, to: f * p * 0.75, glide: 1.7, type: 'sawtooth', detune: det, a: 0.2, hold: 0.55, dur: 1,
        g: 0.11, cut: 180, cutTo: 1300, cutGlide: 0.6, q: 4, wet: 0.3, vib: [7, 28, 0.1],
      });
    }
    noise(d, { t, a: 0.15, hold: 0.4, dur: 1.1, g: 0.16, type: 'lowpass', f: 600 * p, to: 140, q: 1, wet: 0.25 });
  },
  explosion: (d, t, p) => {
    noise(d, { t, dur: 0.75, g: 0.5, type: 'lowpass', f: 5000 * p, to: 160, glide: 0.65, wet: 0.3 });
    tone(d, { t, f: 95 * p, to: 32 * p, glide: 0.5, dur: 0.55, g: 0.5, wet: 0.05 });
    noise(d, { t: t + 0.02, dur: 0.25, g: 0.12, type: 'bandpass', f: 900 * p, q: 0.6, wet: 0.2 });
  },
  ore: (d, t, p) => {
    metal(d, t, 2300 * p, 0.07, 0.2);
    noise(d, { t, dur: 0.12, g: 0.24, type: 'bandpass', f: 1700 * p, q: 0.9, wet: 0.1 });
    tone(d, { t, f: 170 * p, to: 70 * p, glide: 0.09, dur: 0.11, g: 0.2, wet: 0.03 });
    noise(d, { t: t + 0.05, dur: 0.15, g: 0.08, type: 'bandpass', f: 3500 * p, q: 2, wet: 0.15 });
  },
  stairs: (d, t, p) => {
    [392, 330, 294, 247].forEach((f, i) => {
      const ti = t + i * 0.085;
      tone(d, { t: ti, f: f * p, type: 'triangle', a: 0.002, dur: 0.07, g: 0.09, wet: 0.2 });
      noise(d, { t: ti, dur: 0.045, g: 0.07, type: 'lowpass', f: 700 * p, wet: 0.1 });
    });
    noise(d, { t, a: 0.12, dur: 0.3, g: 0.05, type: 'bandpass', f: 900 * p, to: 300 * p, q: 0.8, wet: 0.3 });
  },
  blip: (d, t, p) => {
    tone(d, { t, f: 1320 * p, type: 'triangle', a: 0.001, dur: 0.045, g: 0.15, wet: 0.05 });
    tone(d, { t, f: 2640 * p, a: 0.001, dur: 0.02, g: 0.03, wet: 0.05 });
  },
  confirm: (d, t, p) => {
    chime(d, t, 880 * p, 0.1, 0.1, 0.2);
    chime(d, t + 0.075, 1320 * p, 0.11, 0.22, 0.25);
  },
  cancel: (d, t, p) => {
    tone(d, { t, f: 660 * p, type: 'triangle', dur: 0.08, g: 0.1, wet: 0.1 });
    tone(d, { t: t + 0.07, f: 440 * p, type: 'triangle', dur: 0.14, g: 0.1, wet: 0.1 });
  },
  error: (d, t, p) => {
    for (const dt of [0, 0.12]) {
      for (const f of [110, 116.5]) {
        tone(d, { t: t + dt, f: f * p, type: 'sawtooth', a: 0.008, hold: 0.06, dur: 0.06, g: 0.06, cut: 650 * p, wet: 0.05 });
      }
    }
  },
  fanfare: (d, t, p) => {
    const notes: Array<[number, number, number]> = [[392, 0, 0.11], [523, 0.12, 0.11], [659, 0.24, 0.11], [784, 0.36, 0.85]];
    for (const [f, dt, len] of notes) brassTone(d, t + dt, f * p, len, 1.6);
    for (const f of [523, 659, 784]) {
      tone(d, { t: t + 0.36, f: f * p, type: 'triangle', a: 0.05, hold: 0.45, dur: 0.6, g: 0.05, wet: 0.5 });
    }
    chime(d, t + 0.42, 1568 * p, 0.05, 0.5, 0.6);
    chime(d, t + 0.5, 2093 * p, 0.04, 0.6, 0.6);
  },
  levelUp: (d, t, p) => {
    [523, 587, 659, 784, 880, 1047, 1175, 1319].forEach((f, i) => chime(d, t + i * 0.045, f * p, 0.06, 0.22, 0.4));
    for (const f of [1047, 1319, 1568, 2093]) {
      fm(d, { t: t + 0.4, f: f * p, ratio: 2, index: 0.6, a: 0.01, dur: 1, g: 0.035, wet: 0.6 });
    }
    noise(d, { t: t + 0.38, a: 0.1, dur: 0.8, g: 0.025, type: 'highpass', f: 6500, wet: 0.6 });
  },
  weaveStar: (d, t, p) => {
    const f = 1047 * p; // celesta C6; callers raise `pitch` for each successive star
    tone(d, { t, f, a: 0.002, dur: 0.7, g: 0.14, wet: 0.55 });
    tone(d, { t, f: f * 2, a: 0.002, dur: 0.3, g: 0.042, wet: 0.55 });
    tone(d, { t, f: f * 4, a: 0.001, dur: 0.12, g: 0.035, wet: 0.55 });
  },
  weaveSuccess: (d, t, p) => {
    for (const f of [523, 659, 784, 988, 1175]) {
      tone(d, { t, f: f * p, type: 'triangle', a: 0.14, hold: 0.12, dur: 0.6, g: 0.04, wet: 0.6 });
      tone(d, { t, f: f * p, type: 'sawtooth', a: 0.18, hold: 0.08, dur: 0.5, g: 0.012, cut: 1400, wet: 0.6, detune: 6 });
    }
    [1568, 1976, 2349, 3136].forEach((f, i) => chime(d, t + 0.08 + i * 0.05, f * p, 0.04, 0.3, 0.6));
  },
  weaveFail: (d, t, p) => {
    [659, 523, 440].forEach((f, i) =>
      tone(d, { t: t + i * 0.12, f: f * p, type: 'triangle', a: 0.006, dur: i === 2 ? 0.4 : 0.14, g: 0.1, wet: 0.25, vib: [7, 30, 0] }));
    tone(d, { t: t + 0.24, f: 110 * p, to: 70 * p, glide: 0.2, dur: 0.25, g: 0.12, wet: 0.05 });
  },
  splash: (d, t, p) => {
    noise(d, { t, a: 0.004, dur: 0.25, g: 0.18, type: 'highpass', f: 1300 * p, wet: 0.2 });
    noise(d, { t, a: 0.01, dur: 0.32, g: 0.16, type: 'bandpass', f: 2200 * p, to: 650 * p, q: 0.8, wet: 0.2 });
    for (const dt of [0.08, 0.15]) {
      tone(d, { t: t + dt, f: 320 * p, to: 540 * p, glide: 0.05, dur: 0.07, g: 0.08, wet: 0.2 });
    }
  },
  moo: (d, t, p) => {
    // "mmm-OOO": resonant lowpass opens while the pitch sags; a sine sub gives the chest.
    tone(d, {
      t, f: 165 * p, to: 120 * p, glide: 0.7, type: 'sawtooth', a: 0.09, hold: 0.32, dur: 0.32, g: 0.07,
      cut: 320, cutTo: 1100, cutGlide: 0.35, q: 6, wet: 0.15, vib: [5, 22, 0.15],
    });
    tone(d, { t, f: 82 * p, to: 60 * p, glide: 0.7, a: 0.09, hold: 0.32, dur: 0.3, g: 0.07, wet: 0.05 });
  },
  quack: (d, t, p) => {
    const quacks: Array<[number, number]> = [[0, 1], [0.17, 0.9]];
    for (const [dt, k] of quacks) {
      const f = 560 * p * k;
      tone(d, {
        t: t + dt, f, to: f * 0.72, glide: 0.11, type: 'sawtooth', a: 0.006, hold: 0.04, dur: 0.08,
        g: 0.24 * k, ftype: 'bandpass', cut: 1150 * p, q: 3.5, wet: 0.1,
      });
      tone(d, {
        t: t + dt, f, to: f * 0.72, glide: 0.11, type: 'square', a: 0.006, hold: 0.03, dur: 0.07,
        g: 0.05 * k, ftype: 'bandpass', cut: 2500 * p, q: 5, wet: 0.1,
      });
    }
  },
  door: (d, t, p) => {
    noise(d, { t, dur: 0.14, g: 0.22, type: 'lowpass', f: 850 * p, wet: 0.15 });
    tone(d, { t, f: 150 * p, to: 105 * p, glide: 0.12, type: 'triangle', dur: 0.16, g: 0.2, wet: 0.15 });
    noise(d, { t: t + 0.15, a: 0.001, dur: 0.025, g: 0.11, type: 'highpass', f: 2600 * p, wet: 0.1 });
    tone(d, { t: t + 0.15, f: 1900 * p, type: 'triangle', a: 0.001, dur: 0.02, g: 0.04, wet: 0.1 });
  },
  sleep: (d, t, p) => {
    [[784, 0, 0.7], [659, 0.36, 0.7], [523, 0.72, 1]].forEach(([f, dt, dur]) => {
      tone(d, { t: t + dt, f: f * p, a: 0.02, dur, g: 0.08, wet: 0.6 });
      tone(d, { t: t + dt, f: f * p * 0.5, type: 'triangle', a: 0.03, dur: dur * 0.8, g: 0.03, wet: 0.6 });
    });
  },
  heart: (d, t, p) => {
    tone(d, { t, f: 1319 * p, to: 1480 * p, glide: 0.04, a: 0.003, dur: 0.09, g: 0.09, wet: 0.3 });
    tone(d, { t: t + 0.09, f: 1760 * p, to: 1865 * p, glide: 0.05, a: 0.003, dur: 0.18, g: 0.1, wet: 0.35 });
    tone(d, { t: t + 0.09, f: 3520 * p, a: 0.002, dur: 0.08, g: 0.02, wet: 0.3 });
  },
  shutter: (d, t, p) => {
    noise(d, { t, a: 0.001, dur: 0.022, g: 0.28, type: 'highpass', f: 3200 * p, wet: 0.05 });
    tone(d, { t, f: 2400 * p, type: 'square', a: 0.001, dur: 0.008, g: 0.025, cut: 6000, wet: 0 });
    noise(d, { t: t + 0.065, a: 0.001, dur: 0.035, g: 0.2, type: 'bandpass', f: 1900 * p, q: 1.2, wet: 0.05 });
    noise(d, { t: t + 0.07, a: 0.002, dur: 0.05, g: 0.08, type: 'lowpass', f: 700 * p, wet: 0 });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5a. Instruments & drum kit
// ─────────────────────────────────────────────────────────────────────────────

/** (destination, time, MIDI note, note length in seconds, velocity ~0..1.2) */
type Inst = (d: Dest, t: number, midi: number, len: number, vel: number) => void;

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const panOf = (m: number): number => clamp((m - 66) / 40, -0.4, 0.4); // gentle pitch-based stereo spread

const harp: Inst = (d, t, m, _len, v) => {
  const f = mtof(m), pan = panOf(m);
  tone(d, { t, f, type: 'triangle', a: 0.003, dur: 1.5, g: 0.12 * v, cut: 4200, cutTo: 900, wet: 0.5, pan });
  tone(d, { t, f: f * 2, a: 0.002, dur: 0.35, g: 0.035 * v, wet: 0.5, pan });
};

const epiano: Inst = (d, t, m, len, v) => {
  const f = mtof(m), pan = panOf(m);
  fm(d, { t, f, ratio: 1, index: 0.9 + 0.8 * v, indexDur: 0.5, a: 0.004, dur: clamp(len + 0.6, 0.6, 2.4), g: 0.07 * v, wet: 0.3, pan });
  tone(d, { t, f: f * 4, a: 0.001, dur: 0.1, g: 0.01 * v, wet: 0.2, pan }); // tine "ping"
};

const celesta: Inst = (d, t, m, _len, v) => {
  const f = mtof(m), pan = panOf(m);
  tone(d, { t, f, a: 0.002, dur: 1.2, g: 0.07 * v, wet: 0.6, pan });
  tone(d, { t, f: f * 2, a: 0.002, dur: 0.45, g: 0.022 * v, wet: 0.6, pan });
  tone(d, { t, f: f * 4, a: 0.001, dur: 0.14, g: 0.018 * v, wet: 0.6, pan });
};

const bell: Inst = (d, t, m, _len, v) =>
  fm(d, { t, f: mtof(m), ratio: 3.5, index: 2.2, indexDur: 1.6, a: 0.003, dur: 3.2, g: 0.045 * v, wet: 0.85, pan: panOf(m) * 1.5 });

const flute: Inst = (d, t, m, len, v) => {
  const f = mtof(m), pan = panOf(m) * 0.5, hold = Math.max(0, len - 0.06);
  tone(d, { t, f, type: 'triangle', a: 0.035, hold, dur: 0.22, g: 0.06 * v, cut: 2600, wet: 0.4, pan, vib: [5.2, 11, 0.22] });
  tone(d, { t, f, a: 0.04, hold, dur: 0.25, g: 0.035 * v, wet: 0.4, pan, vib: [5.2, 11, 0.22] });
};

const pluck: Inst = (d, t, m, _len, v) => {
  const f = mtof(m), pan = panOf(m);
  tone(d, { t, f, type: 'sawtooth', a: 0.002, dur: 0.55, g: 0.05 * v, cut: 3400, cutTo: 320, cutGlide: 0.22, wet: 0.25, pan });
  tone(d, { t, f, type: 'triangle', a: 0.002, dur: 0.45, g: 0.05 * v, wet: 0.25, pan });
};

/** Detuned saws through a fixed lowpass; `wobble` adds a slow, uneasy pitch drift. */
const pad = (cut: number, level = 1, wobble = false): Inst => (d, t, m, len, v) => {
  const f = mtof(m), a = Math.min(wobble ? 1.6 : 0.9, len * 0.4), hold = Math.max(0, len - a);
  const g = 0.018 * v * level;
  const vib: ToneOpts['vib'] = wobble ? [0.23 + Math.random() * 0.1, 16, 0] : undefined;
  tone(d, { t, f, type: 'sawtooth', a, hold, dur: 0.9, g, detune: -8, cut, wet: 0.6, pan: -0.3, vib });
  tone(d, { t, f, type: 'sawtooth', a, hold, dur: 0.9, g, detune: 8, cut, wet: 0.6, pan: 0.3 });
  tone(d, { t, f, type: 'triangle', a, hold, dur: 0.9, g: g * 0.9, wet: 0.5 });
};

const softBass: Inst = (d, t, m, len, v) => {
  const f = mtof(m);
  tone(d, { t, f, a: 0.008, hold: len * 0.75, dur: 0.25, g: 0.24 * v, wet: 0.02 });
  tone(d, { t, f, type: 'triangle', a: 0.006, hold: len * 0.5, dur: 0.2, g: 0.08 * v, cut: 650, wet: 0.02 });
};

const synthBass: Inst = (d, t, m, len, v) => {
  const f = mtof(m);
  tone(d, { t, f, type: 'sawtooth', a: 0.004, hold: len * 0.5, dur: 0.16, g: 0.09 * v, cut: 1100, cutTo: 220, cutGlide: 0.18, q: 3, wet: 0.04 });
  tone(d, { t, f, a: 0.004, hold: len * 0.6, dur: 0.15, g: 0.18 * v, wet: 0.02 });
};

const arpSynth: Inst = (d, t, m, _len, v) =>
  tone(d, { t, f: mtof(m), type: 'square', a: 0.002, dur: 0.2, g: 0.026 * v, cut: 2400, cutTo: 500, cutGlide: 0.15, wet: 0.3, pan: panOf(m) * 1.5 });

const sawLead: Inst = (d, t, m, len, v) => {
  const f = mtof(m), hold = Math.max(0, len - 0.04);
  for (const det of [-7, 7]) {
    tone(d, { t, f, type: 'sawtooth', a: 0.01, hold, dur: 0.16, g: 0.03 * v, detune: det, cut: 2300, q: 2, wet: 0.3, pan: det / 40, vib: [6, 9, 0.15] });
  }
};

const brass: Inst = (d, t, m, len, v) => brassTone(d, t, mtof(m), len, v);

type DrumName = 'kick' | 'kick2' | 'snare' | 'rim' | 'hat' | 'ohat' | 'clap' | 'shaker' | 'tom' | 'ftom' | 'crash';
type Drum = (d: Dest, t: number, v: number) => void;

const KIT: Record<DrumName, Drum> = {
  kick: (d, t, v) => tone(d, { t, f: 140, to: 48, glide: 0.09, a: 0.002, dur: 0.26, g: 0.42 * v, wet: 0 }),
  kick2: (d, t, v) => {
    tone(d, { t, f: 160, to: 42, glide: 0.11, a: 0.002, dur: 0.34, g: 0.58 * v, wet: 0 });
    noise(d, { t, a: 0.001, dur: 0.02, g: 0.12 * v, type: 'lowpass', f: 3500, wet: 0 });
  },
  snare: (d, t, v) => {
    noise(d, { t, a: 0.001, dur: 0.16, g: 0.16 * v, type: 'bandpass', f: 1900, q: 0.7, wet: 0.25 });
    tone(d, { t, f: 200, to: 160, glide: 0.06, type: 'triangle', a: 0.001, dur: 0.08, g: 0.12 * v, wet: 0.1 });
  },
  rim: (d, t, v) => {
    tone(d, { t, f: 1750, type: 'triangle', a: 0.001, dur: 0.035, g: 0.07 * v, wet: 0.2 });
    noise(d, { t, a: 0.001, dur: 0.02, g: 0.06 * v, type: 'highpass', f: 3000, wet: 0.2 });
  },
  hat: (d, t, v) => noise(d, { t, a: 0.001, dur: 0.035, g: 0.05 * v, type: 'highpass', f: 7500, wet: 0.08 }),
  ohat: (d, t, v) => noise(d, { t, a: 0.002, dur: 0.22, g: 0.04 * v, type: 'highpass', f: 7000, wet: 0.15 }),
  clap: (d, t, v) => {
    for (const dt of [0, 0.011, 0.022]) {
      noise(d, { t: t + dt, a: 0.001, dur: dt === 0.022 ? 0.14 : 0.012, g: 0.13 * v, type: 'bandpass', f: 1300, q: 1.1, wet: 0.35 });
    }
  },
  shaker: (d, t, v) => noise(d, { t, a: 0.012, dur: 0.05, g: 0.035 * v, type: 'bandpass', f: 6500, q: 1.2, wet: 0.1 }),
  tom: (d, t, v) => tone(d, { t, f: 220, to: 150, glide: 0.15, a: 0.002, dur: 0.24, g: 0.22 * v, wet: 0.2 }),
  ftom: (d, t, v) => tone(d, { t, f: 140, to: 95, glide: 0.18, a: 0.002, dur: 0.3, g: 0.25 * v, wet: 0.2 }),
  crash: (d, t, v) => noise(d, { t, a: 0.002, dur: 1.3, g: 0.05 * v, type: 'highpass', f: 5200, wet: 0.35 }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 5b. Harmony, patterns and parts
// ─────────────────────────────────────────────────────────────────────────────

const BARS = 8; // every track is an 8-bar progression of 16th-note steps
const STEPS_PER_LOOP = BARS * 16;

const NOTE_PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], mM7: [0, 3, 7, 11], '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10], '9sus4': [0, 5, 7, 10, 14], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  aug: [0, 4, 8], 'maj7#11': [0, 4, 7, 11, 18],
};

interface Chord { root: number; bass: number; iv: number[] }

function parseChord(sym: string): Chord {
  const m = /^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/.exec(sym);
  const root: number | undefined = m ? NOTE_PC[m[1]] : undefined;
  const iv: number[] | undefined = m ? QUALITIES[m[2]] : undefined;
  if (!m || root === undefined || !iv) throw new Error(`bad chord symbol "${sym}"`);
  const bass: number | undefined = m[3] ? NOTE_PC[m[3]] : root;
  if (bass === undefined) throw new Error(`bad slash bass in "${sym}"`);
  return { root, bass, iv };
}

function noteToMidi(name: string): number {
  const m = /^([A-G][b#]?)(-?\d)$/.exec(name);
  const pc: number | undefined = m ? NOTE_PC[m[1]] : undefined;
  if (!m || pc === undefined) throw new Error(`bad note "${name}"`);
  return pc + 12 * (Number(m[2]) + 1);
}

interface NoteEvent { midi: number; steps: number }

/** "C#5:4 r:2 …" (note:length-in-16ths, `|` is a visual bar line) → step → event. */
function parsePhrase(src: string): Map<number, NoteEvent> {
  const events = new Map<number, NoteEvent>();
  let pos = 0;
  for (const tok of src.split(/[\s|]+/)) {
    if (!tok) continue;
    const [name, len] = tok.split(':');
    const steps = Number(len ?? '1');
    if (!Number.isInteger(steps) || steps <= 0) throw new Error(`bad note length in "${tok}"`);
    if (name !== 'r') events.set(pos, { midi: noteToMidi(name), steps });
    pos += steps;
  }
  if (pos !== STEPS_PER_LOOP) warnOnce(`melody phrase spans ${pos} steps, expected ${STEPS_PER_LOOP}: "${src.slice(0, 40)}…"`);
  return events;
}

function checkPatterns(where: string, pats: readonly string[], len = 16): void {
  for (const p of pats) if (p.length !== len) warnOnce(`${where}: pattern "${p}" has ${p.length} steps, expected ${len}`);
}

/** Chord tones folded into one octave [low, low+12): smooth, fixed-register voicings. */
const closeVoicing = (c: Chord, low: number): number[] =>
  c.iv.map((i) => low + mod12(c.root + i - low)).sort((a, b) => a - b);
/** Root-position chord tones starting at the first root ≥ low (for arpeggios). */
const arpTones = (c: Chord, low: number): number[] => c.iv.map((i) => low + mod12(c.root - low) + i);
const toneAt = (tones: number[], k: number): number => tones[k % tones.length] + 12 * Math.floor(k / tones.length);
const human = (v: number): number => v * (0.88 + Math.random() * 0.2);

interface StepInfo {
  d: Dest; t: number; sd: number; // destination, step time (swing applied), seconds per 16th
  step: number; bar: number; loop: number;
  chord: Chord; next: Chord; // current chord and the chord at the next change
  isChange: boolean; span: number; // chord starts on this step; its length in steps
}
type Part = (s: StepInfo) => void;
type When = (loop: number, bar: number) => boolean;
interface PartOpts { when?: When; vel?: number }

const active = (o: PartOpts, s: StepInfo): boolean => !o.when || o.when(s.loop, s.bar);
const notIntro: When = (l, b) => l > 0 || b >= 2;

/** Sustained chord on every chord change. */
function padPart(inst: Inst, low: number, o: PartOpts = {}): Part {
  return (s) => {
    if (!s.isChange || !active(o, s)) return;
    for (const m of closeVoicing(s.chord, low)) inst(s.d, s.t, m, s.span * s.sd, o.vel ?? 1);
  };
}

/** Rhythmic chord comping: 'x' hit, 'X' accent, '-' extends the previous hit, '.' rest. */
function compPart(inst: Inst, low: number, rhythms: string[], o: PartOpts & { strum?: number } = {}): Part {
  checkPatterns('comp', rhythms);
  return (s) => {
    if (!active(o, s)) return;
    const r = rhythms[(s.bar + s.loop) % rhythms.length];
    const ch = r[s.step];
    if (ch !== 'x' && ch !== 'X') return;
    let n = 1;
    while (s.step + n < 16 && r[s.step + n] === '-') n++;
    const v = (ch === 'X' ? 1 : 0.75) * (o.vel ?? 1);
    closeVoicing(s.chord, low).forEach((m, i) => inst(s.d, s.t + i * (o.strum ?? 0), m, n * s.sd, human(v)));
  };
}

/** Arpeggio: digits index chord tones upward across octaves; '.' rest. */
function arpPart(inst: Inst, low: number, patterns: string[], o: PartOpts & { len?: number } = {}): Part {
  checkPatterns('arp', patterns);
  return (s) => {
    if (!active(o, s)) return;
    const k = '0123456789'.indexOf(patterns[(s.bar + s.loop) % patterns.length][s.step] ?? '.');
    if (k < 0) return;
    const v = (s.step % 4 === 0 ? 1 : 0.8) * (o.vel ?? 1);
    inst(s.d, s.t, toneAt(arpTones(s.chord, low), k), (o.len ?? 2) * s.sd, human(v));
  };
}

/** Bass line: R root(/slash bass), 3 5 7 chord degrees, 8 octave, a = approach note below the next root. */
function bassPart(inst: Inst, low: number, patterns: string[], o: PartOpts = {}): Part {
  checkPatterns('bass', patterns);
  return (s) => {
    if (!active(o, s)) return;
    const pat = patterns[s.bar % patterns.length];
    const ch = pat[s.step];
    let n = 1;
    while (s.step + n < 16 && pat[s.step + n] === '-') n++;
    const iv = s.chord.iv;
    const r0 = low + mod12(s.chord.root - low);
    const bassRoot = low + mod12(s.chord.bass - low);
    let m: number;
    switch (ch) {
      case 'R': m = bassRoot; break;
      case '3': m = r0 + (iv.includes(3) ? 3 : iv.includes(4) ? 4 : 5); break;
      case '5': m = r0 + (iv.includes(6) && !iv.includes(7) ? 6 : 7); break;
      case '7': m = r0 + (iv.find((i) => i === 10 || i === 11 || i === 9) ?? 12); break;
      case '8': m = bassRoot + 12; break;
      case 'a': m = low + mod12(s.next.bass - low) - 1; break;
      default: return;
    }
    const accent = s.step % 4 === 0 ? 1 : 0.85;
    inst(s.d, s.t, m, n * s.sd * 0.92, human((o.vel ?? 1) * accent));
  };
}

/** Melody: one phrase per loop repetition (cycled); '' = rest for that repetition. */
function melPart(inst: Inst, phrases: string[], o: PartOpts & { shift?: number } = {}): Part {
  const parsed = phrases.map((p) => (p.trim() ? parsePhrase(p) : null));
  return (s) => {
    if (!active(o, s)) return;
    const ev = parsed[s.loop % parsed.length]?.get(s.bar * 16 + s.step);
    if (!ev) return;
    inst(s.d, s.t, ev.midi + (o.shift ?? 0), ev.steps * s.sd * 0.92, human(o.vel ?? 1));
  };
}

/** Random twinkles drawn from the current chord. */
function sparklePart(inst: Inst, low: number, o: PartOpts & { prob: number; every: number }): Part {
  return (s) => {
    if (s.step % o.every !== 0 || !active(o, s) || Math.random() >= o.prob) return;
    const tones = arpTones(s.chord, low);
    const k = Math.floor(Math.random() * tones.length * 2);
    inst(s.d, s.t + Math.random() * s.sd * 0.5, toneAt(tones, k), s.sd * 4, human(o.vel ?? 0.7));
  };
}

/**
 * Drums: per-instrument 16-step patterns ('X' accent, 'x' hit, 'o' ghost). `fill` patterns (4 steps)
 * replace steps 12–15 of the last bar of every 4; `crash` marks the top of each repetition.
 */
function drumPart(
  pats: Partial<Record<DrumName, string[]>>,
  o: PartOpts & { fill?: Partial<Record<DrumName, string>>; crash?: boolean } = {},
): Part {
  const fill = o.fill ?? {};
  const names = [...new Set([...Object.keys(pats), ...Object.keys(fill)])] as DrumName[];
  for (const n of names) {
    checkPatterns(`drums.${n}`, pats[n] ?? []);
    const f = fill[n];
    if (f !== undefined) checkPatterns(`fill.${n}`, [f], 4);
  }
  return (s) => {
    if (!active(o, s)) return;
    const vel = o.vel ?? 1;
    const inFill = s.step >= 12 && s.bar % 4 === 3;
    if (o.crash && s.bar === 0 && s.step === 0 && s.loop > 0) KIT.crash(s.d, s.t, vel);
    for (const n of names) {
      const f = fill[n];
      const arr = pats[n];
      const ch = inFill && f !== undefined ? f[s.step - 12] : arr ? arr[s.bar % arr.length][s.step] : undefined;
      const v = ch === 'X' ? 1 : ch === 'x' ? 0.8 : ch === 'o' ? 0.42 : 0;
      if (v > 0) KIT[n](s.d, s.t, human(v * vel));
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5c. Tracks (8 bars each; melody phrases are 8 bars = 128 sixteenths)
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_A = 'A5:6 F#5:2 E5:4 F#5:4 | C#5:8 A4:4 C#5:4 | D5:6 E5:2 F#5:4 B5:4 | A5:12 r:4 | F#5:6 E5:2 D5:4 B4:4 | C#5:6 D5:2 E5:4 A5:4 | G5:6 F#5:2 E5:4 D5:4 | E5:12 r:4';
const TITLE_B = 'r:4 D6:2 C#6:2 A5:4 F#5:4 | E5:6 F#5:2 C#5:8 | r:4 B5:2 A5:2 F#5:4 D5:4 | E5:6 D5:2 Bb4:8 | r:2 F#5:2 A5:2 B5:2 D6:8 | C#6:6 B5:2 A5:8 | G5:4 F#5:4 E5:4 B4:4 | D5:8 C#5:8';
const DAY_A = 'r:2 E5:2 G5:2 A5:4 G5:2 E5:4 | D5:6 E5:2 F5:4 D5:4 | r:2 B4:2 D5:2 E5:4 G5:2 E5:4 | C5:8 r:4 A4:2 C5:2 | D5:4 E5:2 F5:2 A5:4 C6:4 | A5:6 F5:2 G5:4 B4:4 | E5:12 D5:2 C5:2 | r:4 G5:2 A5:2 Bb5:4 G5:4';
const DAY_B = 'A5:4 C6:4 A5:2 G5:2 E5:4 | F5:4 D5:4 B4:4 D5:4 | G5:6 E5:2 D5:4 B4:4 | C5:4 E5:4 A5:8 | G5:2 F5:2 E5:2 F5:2 A5:8 | G5:6 F5:2 D5:8 | E5:4 G5:4 B5:8 | C6:8 r:8';
const NIGHT_A = 'C#6:8 B5:4 G#5:4 | A5:12 F#5:4 | G#5:8 E5:4 B5:4 | A5:12 r:4 | F#5:8 D5:4 C#5:4 | F5:8 A5:4 B5:4 | C#6:6 B5:2 A5:8 | B5:12 r:4';
const NIGHT_B = 'r:4 E5:4 A5:4 B5:4 | C#6:8 A5:8 | B5:4 G#5:4 E5:8 | F#5:4 G#5:4 A5:8 | D6:8 C#6:4 B5:4 | A5:8 F5:8 | E5:4 G#5:4 C#6:8 | B5:16';
const VILLAGE_A = 'D5:4 B4:2 D5:2 G5:4 F#5:2 G5:2 | A5:6 F#5:2 D5:8 | E5:4 G5:2 E5:2 B4:4 D5:4 | E5:12 r:4 | C5:4 E5:2 C5:2 A4:4 C5:4 | D5:6 E5:2 F#5:4 A5:4 | B5:6 A5:2 G5:4 D5:4 | E5:4 D5:2 C5:2 F#5:4 A5:4';
const VILLAGE_B = 'B5:4 A5:2 G5:2 D5:4 G5:4 | F#5:4 E5:2 D5:2 A4:8 | G5:4 F#5:2 E5:2 D5:4 B4:4 | C5:4 E5:4 G5:8 | A5:4 G5:2 E5:2 C5:4 E5:4 | F#5:4 A5:4 C6:8 | B5:12 A5:2 B5:2 | G5:8 A5:4 F#5:4';
const FEST_A = 'C5:2 F5:2 A5:2 C6:4 A5:2 F5:4 | G5:6 E5:2 C5:8 | D5:2 F5:2 A5:2 C6:4 A5:2 F5:4 | D6:8 C6:4 A5:4 | Bb5:4 A5:2 G5:2 F5:4 D5:4 | E5:4 G5:4 Bb5:4 C6:4 | A5:6 G5:2 F5:8 | G5:4 A5:2 Bb5:2 C6:4 E5:4';
const FEST_B = 'A5:4 A5:2 Bb5:2 C6:4 A5:4 | G5:4 G5:2 A5:2 G5:4 E5:4 | F5:4 F5:2 G5:2 A5:4 F5:4 | D5:8 F5:8 | G5:2 A5:2 Bb5:2 D6:2 C6:4 Bb5:4 | A5:4 G5:4 E5:4 C5:4 | C5:4 E5:4 F5:4 A5:4 | G5:8 r:4 C5:4';
const MINE_A = 'B4:6 E5:2 G5:4 F#5:4 | E5:12 r:4 | G5:6 E5:2 B5:4 A5:4 | G5:12 r:4 | C6:6 B5:2 A5:4 E5:4 | G5:4 A5:4 B5:8 | A5:6 F#5:2 C6:4 A5:4 | B5:8 D#5:8';
const MINE_B = 'E5:2 F#5:2 G5:4 B5:4 D6:4 | B5:12 r:4 | C6:4 B5:4 G5:4 E5:4 | F#5:12 r:4 | E5:4 A5:4 C6:4 E6:4 | D6:8 C6:4 B5:4 | A5:4 C6:4 E6:4 C6:4 | B5:6 A5:2 F#5:4 D#5:4';
const BOSS_A = 'C5:2 C5:2 Eb5:2 G5:4 F5:2 Eb5:4 | C6:6 Bb5:2 Ab5:4 Eb5:4 | F5:2 F5:2 Ab5:2 C6:4 Bb5:2 Ab5:4 | B5:8 D6:4 B5:4 | C6:2 C6:2 Bb5:2 G5:4 Eb5:2 G5:4 | F5:6 Ab5:2 Db6:8 | C6:4 Ab5:4 F5:4 Ab5:4 | G5:4 B5:4 D6:4 F6:4';
const BOSS_B = 'Eb6:4 D6:4 C6:4 G5:4 | Ab5:4 C6:4 Eb6:8 | F6:4 Eb6:4 C6:4 Ab5:4 | G5:4 B5:4 D6:8 | G5:2 Ab5:2 G5:2 Eb5:2 C5:8 | Db5:2 F5:2 Ab5:2 Db6:2 C6:8 | Ab5:4 G5:4 F5:4 Eb5:4 | D5:4 F5:4 B5:8';
const ECLIPSE_A = 'r:8 G5:8 | F#5:16 | r:8 C6:4 B5:4 | r:16 | Eb5:8 D5:8 | r:16 | A5:12 Ab5:4 | r:16';
const ECLIPSE_B = 'r:16 | B4:8 F5:8 | r:16 | E5:4 Bb5:4 r:8 | r:16 | Db6:16 | r:8 G5:8 | r:16';

interface TrackDef { bpm: number; swing?: number; gain?: number; bars: string[]; parts: Part[] }
interface Track { bpm: number; swing: number; gain: number; bars: Chord[][]; parts: Part[] }

const TRACK_DEFS: Record<Exclude<MusicTrack, 'none'>, () => TrackDef> = {
  // Dreamy D major: harp arpeggios over a soft pad, flute melody, celesta sparkles.
  title: () => ({
    bpm: 84,
    bars: ['Dmaj9', 'F#m7', 'Gmaj7', 'Gm6', 'Bm7', 'F#m7', 'Em9', 'A7sus4'],
    parts: [
      padPart(pad(1100), 50),
      bassPart(softBass, 38, ['R-------5-------', 'R-------R---5---'], { vel: 0.85 }),
      arpPart(harp, 62, ['0.1.2.3.4.3.2.1.', '0.2.4.5.6.5.4.2.', '4.3.2.1.2.3.4.5.'], { vel: 0.8 }),
      arpPart(harp, 74, ['............4321', '................'], { when: (l) => l % 2 === 1, vel: 0.45 }),
      melPart(flute, [TITLE_A, TITLE_B, TITLE_A, ''], { vel: 0.9 }),
      melPart(celesta, ['', '', '', TITLE_B], { shift: 12, vel: 0.8 }),
      sparklePart(celesta, 79, { prob: 0.2, every: 4, vel: 0.5 }),
      drumPart({ kick: ['x.......x.......'], shaker: ['..o...o...o...o.'] }, { when: (l) => l >= 1, vel: 0.8 }),
    ],
  }),
  // Bright city-pop in C: Royal-Road-ish changes, syncopated e-piano, walking-ish bass, light kit.
  farmDay: () => ({
    bpm: 96, swing: 0.14,
    bars: ['Fmaj7', 'G7', 'Em7', 'Am7', 'Dm9', 'G9sus4 G7', 'Cmaj9', 'C9'],
    parts: [
      compPart(epiano, 53, ['x--x--x---x-x---', 'x---..x--x..x-..', 'X--x---x--x-x---'], { strum: 0.005 }),
      bassPart(softBass, 36, ['R--R..5.8..R5.a.', 'R-.R..5-R-.38.a.']),
      melPart(flute, [DAY_A, DAY_B, '', DAY_B]),
      melPart(celesta, ['', '', DAY_A, ''], { shift: 12, vel: 0.75 }),
      arpPart(harp, 72, ['................', '..........0.2.4.'], { vel: 0.5 }),
      drumPart({
        kick: ['x.....x...x.....', 'x.....x.x.......'],
        snare: ['....x.......x...'],
        hat: ['x.x.x.x.x.x.x.x.', 'x.xox.x.x.xox.xo'],
        ohat: ['................', '..............x.'],
      }, { when: (l, b) => l > 0 || b >= 1, fill: { snare: 'xoxX' }, crash: true, vel: 0.75 }),
    ],
  }),
  // Slow A major lullaby: harp arpeggios, soft pad, random celesta stars; no drums.
  farmNight: () => ({
    bpm: 70, gain: 0.85,
    bars: ['Amaj9', 'Dmaj9', 'C#m7', 'F#m9', 'Bm9', 'Dm6', 'Amaj7', 'E7sus4'],
    parts: [
      padPart(pad(750, 0.8), 52),
      bassPart(softBass, 33, ['R---------------', 'R-------5-------'], { vel: 0.8 }),
      arpPart(harp, 57, ['0.2.4.6.5.3.4.2.', '0.1.2.3.4.5.6.7.', '7.5.6.4.3.1.2.0.'], { vel: 0.75 }),
      arpPart(harp, 69, ['........01234567'], { when: (_l, b) => b % 4 === 3, vel: 0.45 }),
      sparklePart(celesta, 81, { prob: 0.3, every: 2, vel: 0.45 }),
      melPart(flute, [NIGHT_A, '', NIGHT_B, ''], { vel: 0.65 }),
    ],
  }),
  // Warm acoustic G major: strummed plucks, boom-chick bass, harp melody, shaker + rim.
  village: () => ({
    bpm: 100, swing: 0.08, gain: 1.15,
    bars: ['G', 'D/F#', 'Em7', 'Cmaj7', 'Am7', 'D7', 'Gmaj7', 'C D'],
    parts: [
      compPart(pluck, 55, ['X..x..x...x.x.x.', 'X..x..x.X.x..x..'], { strum: 0.012, vel: 0.8 }),
      padPart(pad(700, 0.5), 55),
      bassPart(softBass, 43, ['R.......5.......', 'R.......5..58.a.']),
      melPart(harp, [VILLAGE_A, VILLAGE_B, VILLAGE_A, VILLAGE_B], { vel: 1.1 }),
      melPart(flute, ['', '', VILLAGE_A, VILLAGE_B], { vel: 0.5 }),
      drumPart(
        { kick: ['x.......x.......'], rim: ['....x.......x...'], shaker: ['xoxoxoxoxoxoxoxo'] },
        { when: notIntro, fill: { tom: '.xx.', ftom: '...x' }, vel: 0.7 },
      ),
    ],
  }),
  // Upbeat F major: four-on-the-floor, claps, offbeat e-piano skank, brass stabs every other pass.
  festival: () => ({
    bpm: 120,
    bars: ['F', 'C/E', 'Dm7', 'Bbmaj7', 'Gm7', 'C7', 'Am7 Dm7', 'Gm7 C7'],
    parts: [
      compPart(epiano, 57, ['..x...x...x...x.', '..x...x...x.x.x.'], { vel: 0.75 }),
      compPart(brass, 60, ['X-.........x-...', '..........X-.x-.'], { when: (l) => l % 2 === 1, vel: 0.9 }),
      bassPart(softBass, 41, ['R.8.R.8.R.8.5.a.', 'R.8.R.8.5.8.3.a.']),
      arpPart(harp, 65, ['0.2.4.2.0.2.4.2.'], { when: (l) => l % 2 === 0, vel: 0.5 }),
      melPart(flute, [FEST_A, FEST_B, FEST_A, FEST_B], { vel: 0.95 }),
      melPart(celesta, ['', FEST_A, '', FEST_B], { shift: 12, vel: 0.55 }),
      drumPart({
        kick: ['x...x...x...x...'],
        clap: ['....x.......x...'],
        hat: ['..x...x...x...x.'],
        shaker: ['xoxoxoxoxoxoxoxo'],
      }, { when: (l, b) => l > 0 || b >= 1, fill: { snare: 'xoxx', clap: '...X' }, crash: true, vel: 0.8 }),
    ],
  }),
  // Driving E minor: pulsing synth bass, dark pad, tense 16th arps, crystal pings.
  mine: () => ({
    bpm: 112, gain: 1.1,
    bars: ['Em9', 'Em9', 'Cmaj7', 'Cmaj7', 'Am9', 'Am9', 'F#m7b5', 'B7sus4 B7'],
    parts: [
      padPart(pad(600, 0.9), 52),
      bassPart(synthBass, 40, ['R.R.R.R.R.R.8.R.', 'R.R.R.R.R.8.R.5.']),
      arpPart(arpSynth, 64, ['0312031203120312', '0413041304130413', '7654321076543210'], { when: notIntro, vel: 0.7, len: 1 }),
      sparklePart(celesta, 76, { prob: 0.12, every: 4, vel: 0.5 }),
      melPart(flute, [MINE_A, '', MINE_B, ''], { vel: 0.7 }),
      drumPart({
        kick: ['x.....x...x.....', 'x.....x.x...x...'],
        snare: ['....x.......x...'],
        hat: ['xoxoxoxoxoxoxoxo'],
      }, { when: notIntro, fill: { tom: 'xx..', ftom: '..xX' }, crash: true, vel: 0.8 }),
    ],
  }),
  // Intense C minor: heavy kick, 16th synth bass, urgent arps, saw lead, brass stabs.
  boss: () => ({
    bpm: 140, gain: 1.15,
    bars: ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Db', 'Fm', 'G7'],
    parts: [
      padPart(pad(1300), 55),
      bassPart(synthBass, 36, ['R.RR.RR.R.RR.R8.', 'R.RR.RR.R.RR8.a.']),
      arpPart(arpSynth, 60, ['0123456701234567', '7654321076543210', '0246024602460246'], { vel: 0.7, len: 1 }),
      melPart(sawLead, [BOSS_A, BOSS_B, BOSS_A, BOSS_B]),
      compPart(brass, 60, ['X..X..X.........', '................'], { when: (l) => l % 2 === 1, vel: 0.8 }),
      drumPart({
        kick2: ['x...x...x...x...', 'x...x...x.x.x...'],
        snare: ['....X.......X...'],
        hat: ['xoxoxoxoxoxoxoxo'],
      }, { fill: { snare: 'xxXX', tom: 'x.x.' }, crash: true, vel: 0.85 }),
    ],
  }),
  // Eerie, slow: wobbling dissonant pad, sub drone, heartbeat, occasional inharmonic chimes.
  eclipse: () => ({
    bpm: 58,
    bars: ['CmM7', 'CmM7', 'Abmaj7#11', 'Abmaj7#11', 'Ebaug', 'Ebaug', 'Ddim7', 'G7sus4'],
    parts: [
      padPart(pad(650, 1.1, true), 48),
      bassPart(softBass, 36, ['R---------------'], { vel: 0.7 }),
      sparklePart(bell, 72, { prob: 0.18, every: 4, vel: 0.7 }),
      melPart(celesta, [ECLIPSE_A, '', ECLIPSE_B, ''], { vel: 0.8 }),
      drumPart({ kick: ['x..x............', '................'] }, { vel: 0.45 }),
    ],
  }),
};

const builtTracks = new Map<MusicTrack, Track>();

function getTrack(name: Exclude<MusicTrack, 'none'>): Track {
  const cached = builtTracks.get(name);
  if (cached) return cached;
  const def = TRACK_DEFS[name]();
  if (def.bars.length !== BARS) throw new Error(`track "${name}" must have ${BARS} bars`);
  const track: Track = {
    bpm: def.bpm,
    swing: def.swing ?? 0,
    gain: def.gain ?? 1,
    bars: def.bars.map((b) => b.trim().split(/\s+/).slice(0, 2).map(parseChord)),
    parts: def.parts,
  };
  builtTracks.set(name, track);
  return track;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5d. Sequencer (lookahead scheduling against AudioContext time)
// ─────────────────────────────────────────────────────────────────────────────

const LOOKAHEAD = 0.12; // seconds scheduled ahead of the audio clock
const TICK_MS = 25;
const FADE = 1.2; // crossfade seconds

class TrackPlayer {
  readonly name: MusicTrack;
  private readonly ctx: AudioContext;
  private readonly track: Track;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly dest: Dest;
  private readonly sd: number;
  private index = 0;
  private nextTime: number;

  constructor(e: Engine, track: Track, name: MusicTrack, start: number) {
    this.name = name;
    this.ctx = e.ctx;
    this.track = track;
    this.sd = 60 / track.bpm / 4;
    this.nextTime = start;
    this.dry = this.fadeIn(e.musicBus, start);
    this.wet = this.fadeIn(e.musicSend, start);
    this.dest = { ctx: e.ctx, dry: this.dry, wet: this.wet, noise: e.noise, end: 0 };
  }

  private fadeIn(to: AudioNode, start: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(this.track.gain, start + FADE);
    g.connect(to);
    return g;
  }

  /** Schedule every step that starts before `until`. Silent mode keeps musical time without making nodes. */
  schedule(until: number, silent: boolean): void {
    const now = this.ctx.currentTime;
    let guard = 0;
    // After a main-thread stall, skip steps already in the past instead of playing them in a burst.
    while (this.nextTime < now - 0.02 && guard++ < 10000) this.advance();
    while (this.nextTime < until && guard++ < 10000) {
      if (!silent) this.play(this.index, this.nextTime);
      this.advance();
    }
  }

  private advance(): void {
    this.index++;
    this.nextTime += this.sd;
  }

  private play(index: number, time: number): void {
    const tr = this.track;
    const loop = Math.floor(index / STEPS_PER_LOOP);
    const inLoop = index % STEPS_PER_LOOP;
    const bar = Math.floor(inLoop / 16);
    const step = inLoop % 16;
    const chords = tr.bars[bar];
    const split = chords.length > 1;
    const info: StepInfo = {
      d: this.dest,
      t: step % 2 === 1 ? time + tr.swing * this.sd : time,
      sd: this.sd, step, bar, loop,
      chord: chords[split && step >= 8 ? 1 : 0],
      next: split && step < 8 ? chords[1] : tr.bars[(bar + 1) % BARS][0],
      isChange: step === 0 || (split && step === 8),
      span: split ? 8 : 16,
    };
    for (const part of tr.parts) {
      try {
        part(info);
      } catch (err) {
        warnOnce(`music part failed in "${this.name}"`, err);
      }
    }
  }

  /** Ramp to silence over FADE seconds, then detach. Already-scheduled notes play out under the fade. */
  fadeOut(now: number): void {
    for (const g of [this.dry, this.wet]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + FADE);
    }
    setTimeout(() => {
      this.dry.disconnect();
      this.wet.disconnect();
    }, (FADE + 0.5) * 1000);
  }
}

let desired: MusicTrack = 'none';
let player: TrackPlayer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function tick(): void {
  const e = engine;
  const p = player;
  if (!e || !p) {
    stopTimer();
    return;
  }
  try {
    p.schedule(e.ctx.currentTime + LOOKAHEAD, settings.muted || settings.music <= 0);
  } catch (err) {
    warnOnce('music scheduler failed', err);
  }
}

/** Crossfade from whatever is playing to `name` (requires an unlocked engine). */
function startTrack(name: MusicTrack): void {
  const e = engine;
  if (!e || !unlocked) return; // started later by unlock()
  const now = e.ctx.currentTime;
  if (player) {
    player.fadeOut(now);
    player = null;
  }
  if (name === 'none') {
    stopTimer();
    return;
  }
  player = new TrackPlayer(e, getTrack(name), name, now + 0.06);
  if (timer === null) timer = setInterval(tick, TICK_MS);
  tick();
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Public facade
// ─────────────────────────────────────────────────────────────────────────────

interface Voice { dry: GainNode; wet: GainNode; end: number }
const voices: Voice[] = [];
const MAX_VOICES = 24;
const THROTTLE_MS = 30;
const lastPlayed = new Map<SfxName, number>();
let visibilityHooked = false;

const wallMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function releaseVoice(v: Voice, now: number, fast: boolean): void {
  if (!fast) {
    v.dry.disconnect();
    v.wet.disconnect();
    return;
  }
  for (const g of [v.dry, v.wet]) {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + 0.03);
  }
  setTimeout(() => releaseVoice(v, now, false), 80);
}

function hookVisibility(): void {
  if (visibilityHooked || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    const e = engine;
    if (!e) return;
    try {
      if (document.hidden) settle(e.ctx.suspend(), 'suspend on hide failed');
      else if (unlocked) settle(e.ctx.resume(), 'resume on show failed');
    } catch (err) {
      warnOnce('visibility handling failed', err);
    }
  });
}

function unlock(): void {
  if (engineFailed) return;
  try {
    if (!engine) {
      try {
        engine = createEngine();
      } catch (err) {
        warnOnce('Web Audio initialisation failed; audio disabled', err);
        engine = null;
      }
      if (!engine) {
        engineFailed = true;
        return;
      }
      hookVisibility();
    }
    const ctx = engine.ctx;
    if (ctx.state !== 'running' && !pageHidden()) settle(ctx.resume(), 'AudioContext resume failed');
    if (!unlocked) {
      unlocked = true;
      // iOS Safari only fully unlocks output after a source starts inside the gesture.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
      if (desired !== 'none') startTrack(desired);
    }
  } catch (err) {
    warnOnce('audio unlock failed', err);
  }
}

function playSfx(name: SfxName, opts?: { pitch?: number; volume?: number }): void {
  const e = engine;
  if (!e || !unlocked || settings.muted || settings.sfx <= 0 || pageHidden()) return;
  try {
    const fn: SfxFn | undefined = SFX[name];
    if (fn === undefined) {
      warnOnce(`unknown sfx "${String(name)}"`);
      return;
    }
    const wall = wallMs();
    const last = lastPlayed.get(name);
    if (last !== undefined && wall - last < THROTTLE_MS) return;
    const vol = clamp(finiteOr(opts?.volume, 1), 0, 2);
    if (vol <= 0) return;
    lastPlayed.set(name, wall);
    const pitch = clamp(finiteOr(opts?.pitch, 1), 0.25, 4);
    const ctx = e.ctx;
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].end + 0.1 < now) releaseVoice(voices.splice(i, 1)[0], now, false);
    }
    while (voices.length >= MAX_VOICES) {
      const oldest = voices.shift();
      if (oldest) releaseVoice(oldest, now, true);
    }
    const dry = ctx.createGain();
    dry.gain.value = vol;
    dry.connect(e.sfxBus);
    const wet = ctx.createGain();
    wet.gain.value = vol;
    wet.connect(e.sfxSend);
    const d: Dest = { ctx, dry, wet, noise: e.noise, end: now };
    fn(d, now + 0.01, pitch);
    voices.push({ dry, wet, end: d.end });
  } catch (err) {
    warnOnce(`sfx "${name}" failed`, err);
  }
}

function setMusic(track: MusicTrack): void {
  try {
    if (track === desired) return;
    if (track !== 'none' && !Object.prototype.hasOwnProperty.call(TRACK_DEFS, track)) {
      warnOnce(`unknown music track "${String(track)}"`);
      return;
    }
    desired = track;
    startTrack(track);
  } catch (err) {
    warnOnce(`music "${track}" failed`, err);
  }
}

function setSettings(s: Partial<AudioSettings>): void {
  if (!s || typeof s !== 'object') return;
  if (typeof s.music === 'number' && Number.isFinite(s.music)) settings.music = clamp(s.music, 0, 1);
  if (typeof s.sfx === 'number' && Number.isFinite(s.sfx)) settings.sfx = clamp(s.sfx, 0, 1);
  if (typeof s.muted === 'boolean') settings.muted = s.muted;
  if (engine) {
    try {
      applyLevels(engine, false);
    } catch (err) {
      warnOnce('applying audio levels failed', err);
    }
  }
  saveSettings();
}

export const audio = {
  /** Must be called from a user-gesture handler; creates/resumes the AudioContext. Safe to call many times. */
  unlock,
  /** Play a one-shot effect. pitch = playback-rate-like multiplier (default 1), volume multiplier (default 1). No-op before unlock() or when muted. */
  sfx: playSfx,
  /** Switch background music with a ~1.2s crossfade. Calling with the current track is a no-op. 'none' fades out. May be called before unlock(); the track then starts once unlocked. */
  music: setMusic,
  /** Current track name. */
  get currentTrack(): MusicTrack {
    return desired;
  },
  getSettings(): AudioSettings {
    return { ...settings };
  },
  /** Applies immediately and persists to localStorage key 'astraea-vale/audio'. */
  setSettings,
  /** Returns the new muted state. */
  toggleMute(): boolean {
    setSettings({ muted: !settings.muted });
    return settings.muted;
  },
};
