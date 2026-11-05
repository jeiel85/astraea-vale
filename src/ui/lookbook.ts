import { appearanceToLook, charSprite, type Dir } from '../art/characters';
import { decodeLookbook, emptyPattern, encodeLookbook, PATTERN_PALETTE, starPattern } from '../art/patterns';
import { bannerSprite } from '../art/buildings';
import { audio } from '../engine/audio';
import type { DeviceId, Input } from '../engine/input';
import { VH, VW } from '../engine/screen';
import type { Appearance, GameState } from '../sim/state';
import { keyHint, panel, text, UI, type Ctx } from './draw';
import { isConfirm, type Modal } from './modal';

const HAIR = ['#5a3a8a', '#c8a8ff', '#ff8ac8', '#e8503a', '#ffe27a', '#a8c8e8', '#3a2a2a', '#2a3a6a', '#7fd0a0', '#ffffff'];
const EYES = ['#ff6a9a', '#ffc84a', '#3ad8c8', '#3a8ad8', '#8a4fc7', '#5ad86a', '#e8503a'];
const OUTFIT = ['#ff8aa8', '#5a9ae0', '#7fd0a0', '#ffb03a', '#3a3a8a', '#fff0f6', '#8a4fc7', '#3a8a6a', '#2a2a3a', '#c84a4a'];
const ACCENT = ['#fff4c0', '#ffffff', '#ff5a8a', '#ffe27a', '#3a3a8a', '#9fd8ff', '#2a1f3a'];
const HAIR_STYLES = ['짧은 머리', '긴 생머리', '트윈테일', '포니테일', '뾰족 머리'];

type Row = 'paint' | 'style' | 'hair' | 'eyes' | 'outfit' | 'accent' | 'shirt' | 'banner' | 'copy' | 'paste' | 'video' | 'close';
const ROWS: { id: Row; label: string }[] = [
  { id: 'paint', label: '도트 무늬 그리기' },
  { id: 'style', label: '머리 모양' },
  { id: 'hair', label: '머리 색' },
  { id: 'eyes', label: '눈 색' },
  { id: 'outfit', label: '옷 색' },
  { id: 'accent', label: '포인트 색' },
  { id: 'shirt', label: '무늬를 옷에' },
  { id: 'banner', label: '농장 깃발로 걸기' },
  { id: 'copy', label: '공유 코드 복사' },
  { id: 'paste', label: '공유 코드 붙여넣기' },
  { id: 'video', label: '9:16 룩북 영상 촬영' },
  { id: 'close', label: '저장하고 닫기' },
];

export interface LookbookHost {
  state: GameState;
  toast(msg: string, color?: string): void;
  promptText(title: string, initial: string, maxLength?: number): Promise<string | null>;
  onAppearanceChanged(): void;
}

/** 인게임 도트 룩북 에디터: 무늬를 그리고, 옷·머리를 꾸미고, 코드로 공유하고, 세로 영상을 뽑는다. */
export class LookbookModal implements Modal {
  done = false;
  pausesWorld = true;
  private row = 0;
  private painting = false;
  private cx = 8;
  private cy = 8;
  private color = 5;
  private pattern: number[];
  private ap: Appearance;
  private busy = false;
  private t = 0;
  private readonly gx = 22;
  private readonly gy = 34;
  private readonly cell = 6;

  constructor(public owner: DeviceId, private host: LookbookHost) {
    this.ap = { ...host.state.appearance };
    this.pattern = host.state.appearance.pattern ? [...host.state.appearance.pattern] : starPattern();
  }

  private cycle(list: string[], cur: string, d: number): string {
    const i = list.indexOf(cur);
    return list[(i + d + list.length) % list.length]!;
  }

  private commit(): void {
    this.host.state.appearance = { ...this.ap, pattern: [...this.pattern] };
    this.host.onAppearanceChanged();
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    if (this.busy) return;
    const o = this.owner;
    // 마우스로 바로 칠하기·팔레트 고르기
    if (o === 'kbm' && (input.mouse.left || input.mouse.right)) {
      const mx = Math.floor((input.mouse.x - this.gx) / this.cell);
      const my = Math.floor((input.mouse.y - this.gy) / this.cell);
      if (mx >= 0 && my >= 0 && mx < 16 && my < 16) {
        this.cx = mx;
        this.cy = my;
        this.pattern[my * 16 + mx] = input.mouse.right ? -1 : this.color;
        this.row = 0;
      }
      if (input.mouse.leftPressed) {
        const px = Math.floor((input.mouse.x - this.gx) / 12);
        const py = Math.floor((input.mouse.y - (this.gy + 100)) / 12);
        if (py >= 0 && py < 2 && px >= 0 && px < 9) {
          const idx = py * 9 + px;
          if (idx <= 16) {
            this.color = idx === 16 ? -1 : idx;
            audio.sfx('blip');
          }
        }
      }
    }
    if (this.painting) {
      if (input.nav(o, 'left')) this.cx = (this.cx + 15) % 16;
      if (input.nav(o, 'right')) this.cx = (this.cx + 1) % 16;
      if (input.nav(o, 'up')) this.cy = (this.cy + 15) % 16;
      if (input.nav(o, 'down')) this.cy = (this.cy + 1) % 16;
      if (input.held(o, 'use') || (o !== 'kbm' && input.held(o, 'confirm'))) this.pattern[this.cy * 16 + this.cx] = this.color;
      if (input.pressed(o, 'dash') && o === 'kbm') this.pattern[this.cy * 16 + this.cx] = -1;
      if (input.pressed(o, 'next') || input.pressed(o, 'item')) this.color = this.color >= 15 ? -1 : this.color + 1;
      if (input.pressed(o, 'prev')) this.color = this.color <= -1 ? 15 : this.color - 1;
      if (input.pressed(o, 'cancel') || input.pressed(o, 'interact')) {
        this.painting = false;
        audio.sfx('cancel');
      }
      return;
    }
    if (input.nav(o, 'up')) {
      this.row = (this.row + ROWS.length - 1) % ROWS.length;
      audio.sfx('blip', { volume: 0.4 });
    }
    if (input.nav(o, 'down')) {
      this.row = (this.row + 1) % ROWS.length;
      audio.sfx('blip', { volume: 0.4 });
    }
    const d = input.nav(o, 'left') ? -1 : input.nav(o, 'right') ? 1 : 0;
    const id = ROWS[this.row]!.id;
    if (d !== 0) this.change(id, d);
    if (o === 'kbm' && input.mouse.leftPressed) {
      const ry = Math.floor((input.mouse.y - 32) / 13);
      if (input.mouse.x > 236 && ry >= 0 && ry < ROWS.length) {
        this.row = ry;
        this.activate(ROWS[ry]!.id);
        return;
      }
    }
    if (isConfirm(input, o) && !(o === 'kbm' && input.mouse.leftPressed)) this.activate(id);
    if (input.pressed(o, 'cancel')) {
      this.commit();
      this.done = true;
      audio.sfx('cancel');
    }
  }

  private change(id: Row, d: number): void {
    const a = this.ap;
    if (id === 'style') a.hairStyle = (a.hairStyle + d + HAIR_STYLES.length) % HAIR_STYLES.length;
    else if (id === 'hair') a.hair = this.cycle(HAIR, a.hair, d);
    else if (id === 'eyes') a.eyes = this.cycle(EYES, a.eyes, d);
    else if (id === 'outfit') a.outfit = this.cycle(OUTFIT, a.outfit, d);
    else if (id === 'accent') a.accent = this.cycle(ACCENT, a.accent, d);
    else if (id === 'shirt') a.patternOnShirt = !a.patternOnShirt;
    else if (id === 'banner') this.host.state.bannerPlaced = !this.host.state.bannerPlaced;
    else return;
    audio.sfx('blip');
    this.commit();
  }

  private activate(id: Row): void {
    audio.sfx('confirm');
    switch (id) {
      case 'paint':
        this.painting = true;
        return;
      case 'style':
      case 'hair':
      case 'eyes':
      case 'outfit':
      case 'accent':
      case 'shirt':
      case 'banner':
        this.change(id, 1);
        return;
      case 'copy':
        void this.copyCode();
        return;
      case 'paste':
        void this.pasteCode();
        return;
      case 'video':
        void this.record();
        return;
      case 'close':
        this.commit();
        this.done = true;
    }
  }

  private code(): string {
    return encodeLookbook({ pattern: this.pattern, hairStyle: this.ap.hairStyle, hair: this.ap.hair, eyes: this.ap.eyes, outfit: this.ap.outfit, accent: this.ap.accent });
  }

  private async copyCode(): Promise<void> {
    const code = this.code();
    try {
      await navigator.clipboard.writeText(code);
      this.host.toast('공유 코드를 클립보드에 복사했다. 친구에게 보내 보자!', UI.mint);
    } catch {
      // 클립보드 권한이 없으면 입력 창에 띄워 직접 복사하게 한다.
      this.busy = true;
      await this.host.promptText('아래 공유 코드를 복사하세요', code, 400);
      this.busy = false;
    }
  }

  private async pasteCode(): Promise<void> {
    this.busy = true;
    const txt = await this.host.promptText('공유 코드를 붙여넣으세요 (AV1로 시작)', '', 400);
    this.busy = false;
    if (txt === null) return;
    const c = decodeLookbook(txt);
    if (!c) {
      audio.sfx('error');
      this.host.toast('올바른 공유 코드가 아니다.', UI.red);
      return;
    }
    this.pattern = c.pattern;
    Object.assign(this.ap, { hairStyle: c.hairStyle, hair: c.hair, eyes: c.eyes, outfit: c.outfit, accent: c.accent, patternOnShirt: true });
    this.commit();
    audio.sfx('levelUp');
    this.host.toast('공유 코드의 룩을 불러왔다!', UI.mint);
  }

  private async record(): Promise<void> {
    this.commit();
    this.busy = true;
    this.host.toast('룩북 촬영 중… (6초)', UI.gold);
    try {
      const r = await recordLookbook(this.host.state);
      this.host.toast(r, UI.mint);
      audio.sfx('shutter');
    } catch (e) {
      this.host.toast(`촬영에 실패했다: ${e instanceof Error ? e.message : String(e)}`, UI.red);
    } finally {
      this.busy = false;
    }
  }

  draw(c: Ctx): void {
    panel(c, 8, 8, VW - 16, VH - 16);
    text(c, '룩북 에디터', 18, 13, { color: UI.gold });
    // 그리드
    const g = this.cell;
    c.fillStyle = '#1e1834';
    c.fillRect(this.gx - 1, this.gy - 1, g * 16 + 2, g * 16 + 2);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const v = this.pattern[y * 16 + x]!;
        c.fillStyle = v >= 0 ? PATTERN_PALETTE[v]! : (x + y) % 2 ? '#2e2650' : '#26203f';
        c.fillRect(this.gx + x * g, this.gy + y * g, g, g);
      }
    if (this.painting || this.owner === 'kbm') {
      c.strokeStyle = this.painting ? '#ffffff' : 'rgba(255,255,255,0.4)';
      c.strokeRect(this.gx + this.cx * g + 0.5, this.gy + this.cy * g + 0.5, g - 1, g - 1);
    }
    // 팔레트
    for (let i = 0; i <= 16; i++) {
      const px = this.gx + (i % 9) * 12;
      const py = this.gy + 100 + Math.floor(i / 9) * 12;
      c.fillStyle = i === 16 ? '#26203f' : PATTERN_PALETTE[i]!;
      c.fillRect(px, py, 10, 10);
      if (i === 16) {
        c.fillStyle = UI.red;
        c.fillRect(px + 2, py + 4, 6, 2);
      }
      const sel = i === 16 ? this.color === -1 : this.color === i;
      if (sel) {
        c.strokeStyle = UI.gold;
        c.strokeRect(px - 0.5, py - 0.5, 11, 11);
      }
    }
    keyHint(c, this.gx, this.gy + 126, this.owner === 'kbm' ? '클릭: 칠하기 · 우클릭: 지우기' : '도트 무늬 그리기 → 확인: 칠하기', 'left');
    keyHint(c, this.gx, this.gy + 138, this.painting ? '방향: 이동 · Q/RB: 색 바꾸기 · 취소: 끝' : '', 'left');
    // 미리보기
    const look = appearanceToLook(this.ap);
    const pat = this.ap.patternOnShirt ? this.pattern : null;
    const dirs: Dir[] = ['down', 'side', 'up'];
    dirs.forEach((dir, i) => {
      const frame = Math.floor(this.t * 4) % 3;
      const spr = charSprite(look, dir, frame === 2 ? 0 : frame, pat);
      c.drawImage(spr, 128 + i * 34, 40, spr.width * 1.8, spr.height * 1.8);
    });
    const ban = bannerSprite(this.pattern, this.ap.outfit);
    c.drawImage(ban, 150, 96, ban.width * 1.6, ban.height * 1.6);
    if (this.host.state.bannerPlaced) text(c, '농장에 걸림', 165, 152, { size: 10, align: 'center', color: UI.mint });
    // 옵션
    ROWS.forEach((r, i) => {
      const y = 32 + i * 13;
      const sel = i === this.row && !this.painting;
      if (sel) {
        c.fillStyle = 'rgba(200,168,255,0.22)';
        c.fillRect(236, y - 1, 138, 13);
      }
      text(c, r.label, 242, y, { size: 10, color: sel ? UI.gold : UI.text });
      const val = this.valueOf(r.id);
      if (val) text(c, val, VW - 14, y, { size: 10, align: 'right', color: UI.dim });
    });
    keyHint(c, VW / 2, VH - 20, this.busy ? '처리 중…' : '↑↓ 항목 · ←→ 값 바꾸기 · 확인 실행 · 취소 저장 후 닫기', 'center');
  }

  private valueOf(id: Row): string {
    const a = this.ap;
    switch (id) {
      case 'style': return `◀ ${HAIR_STYLES[a.hairStyle]} ▶`;
      case 'hair':
      case 'eyes':
      case 'outfit':
      case 'accent': return '◀ ▶';
      case 'shirt': return a.patternOnShirt ? '켬' : '끔';
      case 'banner': return this.host.state.bannerPlaced ? '켬' : '끔';
      default: return '';
    }
  }
}

/** 90년대 아니메 오프닝풍 9:16 세로 룩북 영상을 만들어 내려받게 한다. */
export async function recordLookbook(s: GameState): Promise<string> {
  const W = 540;
  const H = 960;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d');
  if (!x) throw new Error('캔버스를 만들 수 없습니다.');
  x.imageSmoothingEnabled = false;
  const look = appearanceToLook(s.appearance);
  const pat = s.appearance.patternOnShirt ? s.appearance.pattern : null;
  const DUR = 6;
  const drawFrame = (t: number) => {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1048');
    g.addColorStop(0.55, '#7a3a8a');
    g.addColorStop(1, '#ff8ab8');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // 집중선(오프닝 연출)
    x.save();
    x.translate(W / 2, H * 0.48);
    for (let i = 0; i < 48; i++) {
      x.rotate((Math.PI * 2) / 48);
      x.fillStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.02})`;
      x.fillRect(120 + ((t * 600 + i * 37) % 300), -2, 160, 4);
    }
    x.restore();
    // 반짝이 별
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137 + t * 30 * (i % 3)) % W;
      const sy = (i * 211 + t * 80) % H;
      const s2 = 2 + (i % 4);
      x.fillStyle = i % 4 === 0 ? '#ffe27a' : '#ffffff';
      x.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i));
      x.fillRect(sx - s2, sy, s2 * 2 + 1, 1);
      x.fillRect(sx, sy - s2, 1, s2 * 2 + 1);
      x.globalAlpha = 1;
    }
    // 캐릭터: 1초마다 방향 전환 + 통통 튀기
    const dirs: Dir[] = ['down', 'side', 'up', 'side'];
    const di = Math.floor(t) % 4;
    const spr = charSprite(look, dirs[di]!, Math.floor(t * 6) % 3 === 1 ? 1 : 0, pat);
    const zoom = Math.min(1, t / 0.6);
    const scale = 14 * (0.6 + 0.4 * zoom);
    const bob = Math.abs(Math.sin(t * Math.PI * 2)) * 16;
    x.save();
    x.translate(W / 2, H * 0.6 - bob);
    if (di === 3) x.scale(-1, 1);
    x.globalAlpha = 0.35;
    x.drawImage(spr, (-spr.width * scale) / 2 - 6, -spr.height * scale, spr.width * scale, spr.height * scale);
    x.globalAlpha = 1;
    x.drawImage(spr, (-spr.width * scale) / 2, -spr.height * scale, spr.width * scale, spr.height * scale);
    x.restore();
    if (s.appearance.pattern) {
      const ban = bannerSprite(s.appearance.pattern, s.appearance.outfit);
      x.drawImage(ban, W - 150, H * 0.6 - 230, ban.width * 6, ban.height * 6);
    }
    // 글자
    x.textAlign = 'center';
    x.font = 'bold 64px Galmuri11';
    const titleY = 150 + Math.max(0, 1 - t / 0.5) * -200;
    x.fillStyle = '#2a1f3a';
    x.fillText('ASTRAEA VALE', W / 2 + 4, titleY + 4);
    x.fillStyle = '#ffe27a';
    x.fillText('ASTRAEA VALE', W / 2, titleY);
    x.font = '32px Galmuri11';
    x.fillStyle = '#ffffff';
    x.fillText('아스트레아 베일 ☆ LOOKBOOK', W / 2, titleY + 50);
    if (t > 1.2) {
      x.font = 'bold 44px Galmuri11';
      x.fillStyle = '#ffffff';
      x.fillText(s.playerName, W / 2, H - 170);
      x.font = '24px Galmuri11';
      x.fillStyle = '#ffe0f0';
      x.fillText(`${['짧은 머리', '긴 생머리', '트윈테일', '포니테일', '뾰족 머리'][s.appearance.hairStyle]} · 오늘의 코디`, W / 2, H - 124);
    }
    // VHS 필터: 주사선 + 잡음 + 비네팅 + 날짜
    x.fillStyle = 'rgba(0,0,0,0.18)';
    for (let yy = 0; yy < H; yy += 4) x.fillRect(0, yy, W, 2);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
      x.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = v;
    x.fillRect(0, 0, W, H);
    x.textAlign = 'left';
    x.font = '24px Galmuri11';
    x.fillStyle = '#ffffff';
    x.fillText(`▶ PLAY  ${Math.floor(t / 60)}:${String(Math.floor(t) % 60).padStart(2, '0')}`, 30, 50);
    x.textAlign = 'right';
    x.fillText('1996.11.05', W - 30, H - 36);
  };

  const canRecord = typeof MediaRecorder !== 'undefined' && typeof cv.captureStream === 'function';
  if (!canRecord) {
    drawFrame(2.2);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('이미지를 만들 수 없습니다.');
    download(blob, 'astraea-vale-lookbook.png');
    return '이 브라우저는 영상 녹화를 지원하지 않아 포스터(PNG)로 저장했다.';
  }
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const stream = cv.captureStream(30);
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start(200);
  const t0 = performance.now();
  // requestAnimationFrame은 탭이 가려지면 멈추므로 타이머로 그린다.
  await new Promise<void>((res) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      drawFrame(Math.min(t, DUR));
      if (t < DUR) setTimeout(step, 1000 / 30);
      else res();
    };
    step();
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  const type = rec.mimeType || 'video/webm';
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type }), `astraea-vale-lookbook.${ext}`);
  return `세로 룩북 영상(${ext})을 저장했다!`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export { emptyPattern };
