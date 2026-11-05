import type { DeviceId, Input } from '../engine/input';
import { audio } from '../engine/audio';
import { panel, text, UI, wrap, type Ctx } from './draw';

export interface Modal {
  /** 이 장치의 입력만 받는다 */
  owner: DeviceId;
  /** true면 열려 있는 동안 월드 시간이 멈춘다 */
  pausesWorld: boolean;
  done: boolean;
  update(dt: number, input: Input): void;
  draw(c: Ctx): void;
  onClose?(): void;
}

export class ModalStack {
  readonly items: Modal[] = [];
  push(m: Modal): Modal {
    this.items.push(m);
    return m;
  }
  get top(): Modal | undefined {
    return this.items[this.items.length - 1];
  }
  get open(): boolean {
    return this.items.length > 0;
  }
  get pausing(): boolean {
    return this.items.some((m) => m.pausesWorld);
  }
  update(dt: number, input: Input): void {
    const t = this.top;
    if (t) t.update(dt, input);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const m = this.items[i]!;
      if (m.done) {
        this.items.splice(i, 1);
        m.onClose?.();
      }
    }
  }
  draw(c: Ctx): void {
    for (const m of this.items) m.draw(c);
  }
  clear(): void {
    this.items.length = 0;
  }
}

export interface ListItem {
  label: string;
  hint?: string;
  disabled?: boolean;
  right?: string;
  color?: string;
}

/** 세로 목록 선택기. 키보드·패드·마우스 모두 지원. */
export class ListNav {
  index = 0;
  scroll = 0;
  constructor(public items: ListItem[], public visible = 8) {}

  update(input: Input, owner: DeviceId, rect: { x: number; y: number; w: number; rowH: number }): 'confirm' | 'cancel' | null {
    const n = this.items.length;
    if (n === 0) return input.pressed(owner, 'cancel') ? 'cancel' : null;
    if (input.nav(owner, 'up')) {
      this.index = (this.index - 1 + n) % n;
      audio.sfx('blip');
    }
    if (input.nav(owner, 'down')) {
      this.index = (this.index + 1) % n;
      audio.sfx('blip');
    }
    if (owner === 'kbm' && input.mouseActive()) {
      const my = input.mouse.y;
      const mx = input.mouse.x;
      if (mx >= rect.x && mx < rect.x + rect.w) {
        const row = Math.floor((my - rect.y) / rect.rowH);
        if (row >= 0 && row < Math.min(this.visible, n - this.scroll)) {
          const idx = row + this.scroll;
          if (idx !== this.index && input.time - input.mouse.lastMove < 0.05) this.index = idx;
          if (input.mouse.leftPressed) {
            this.index = idx;
            return this.items[idx]!.disabled ? null : 'confirm';
          }
        }
      }
      if (input.mouse.wheel !== 0) this.index = Math.max(0, Math.min(n - 1, this.index + input.mouse.wheel));
    }
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + this.visible) this.scroll = this.index - this.visible + 1;
    if (input.pressed(owner, 'cancel')) return 'cancel';
    const conf = owner === 'kbm' ? ['KeyE', 'Enter', 'Space', 'KeyJ'].some((k) => input.keyPressed(k)) : input.pressed(owner, 'confirm');
    if (conf) {
      if (this.items[this.index]?.disabled) {
        audio.sfx('error');
        return null;
      }
      return 'confirm';
    }
    return null;
  }

  draw(c: Ctx, x: number, y: number, w: number, rowH = 16): void {
    const end = Math.min(this.items.length, this.scroll + this.visible);
    for (let i = this.scroll; i < end; i++) {
      const it = this.items[i]!;
      const ry = y + (i - this.scroll) * rowH;
      if (i === this.index) {
        c.fillStyle = 'rgba(200,168,255,0.22)';
        c.fillRect(x, ry - 1, w, rowH);
        text(c, '▶', x + 2, ry + 1, { color: UI.gold });
      }
      text(c, it.label, x + 14, ry + 1, { color: it.disabled ? '#6a5a8a' : (it.color ?? UI.text) });
      if (it.right) text(c, it.right, x + w - 4, ry + 1, { align: 'right', color: it.disabled ? '#6a5a8a' : UI.gold });
    }
    if (this.scroll > 0) text(c, '▲', x + w - 10, y - 10, { size: 10, color: UI.dim });
    if (end < this.items.length) text(c, '▼', x + w - 10, y + this.visible * rowH - 2, { size: 10, color: UI.dim });
  }
}

export function isConfirm(input: Input, owner: DeviceId): boolean {
  if (owner === 'kbm') return ['KeyE', 'Enter', 'Space', 'KeyJ'].some((k) => input.keyPressed(k)) || input.mouse.leftPressed;
  return input.pressed(owner, 'confirm');
}

/** 짧은 확인 상자 */
export class ConfirmModal implements Modal {
  done = false;
  pausesWorld = true;
  private nav: ListNav;
  constructor(public owner: DeviceId, private message: string, choices: { label: string; act: () => void }[]) {
    this.choices = choices;
    this.nav = new ListNav(choices.map((c) => ({ label: c.label })), 6);
  }
  private choices: { label: string; act: () => void }[];
  update(_dt: number, input: Input): void {
    const r = this.nav.update(input, this.owner, { x: 112, y: this.listY, w: 160, rowH: 16 });
    if (r === 'confirm') {
      audio.sfx('confirm');
      this.done = true;
      this.choices[this.nav.index]!.act();
    } else if (r === 'cancel') {
      audio.sfx('cancel');
      this.done = true;
    }
  }
  private listY = 100;
  draw(c: Ctx): void {
    const lines = wrap(c, this.message, 220);
    const h = 20 + lines.length * 14 + this.choices.length * 16;
    const y = Math.round(108 - h / 2);
    panel(c, 82, y, 220, h);
    lines.forEach((l, i) => text(c, l, 192, y + 8 + i * 14, { align: 'center' }));
    this.listY = y + 12 + lines.length * 14;
    this.nav.draw(c, 112, this.listY, 160);
  }
}
