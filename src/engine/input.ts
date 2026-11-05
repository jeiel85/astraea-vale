import type { Screen } from './screen';

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'use' | 'interact' | 'dash' | 'magic' | 'item'
  | 'prev' | 'next' | 'inventory' | 'pause'
  | 'confirm' | 'cancel';

/** kbm = 키보드+마우스(1P 기본), kb2 = 키보드 오른쪽(방향키) 2P, pad0~3 = 게임패드 */
export type DeviceId = 'kbm' | 'kb2' | 'pad0' | 'pad1' | 'pad2' | 'pad3';

const KBM_BASE: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  use: ['KeyJ'],
  interact: ['KeyE', 'KeyF'],
  dash: ['Space', 'KeyK'],
  magic: ['KeyL'],
  item: ['KeyQ'],
  prev: ['KeyZ'],
  next: ['KeyC'],
  inventory: ['Tab', 'KeyI'],
  pause: ['Escape', 'KeyP'],
  confirm: ['KeyE', 'Enter', 'Space', 'KeyJ'],
  cancel: ['Escape', 'Backspace', 'KeyX'],
};
const KB2: Record<Action, string[]> = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  use: ['Period'],
  interact: ['Enter', 'ShiftRight'],
  dash: ['Slash'],
  magic: ['Semicolon'],
  item: ['Quote'],
  prev: ['BracketLeft'],
  next: ['BracketRight'],
  inventory: ['Backslash'],
  pause: [],
  confirm: ['Enter', 'Period'],
  cancel: ['Slash', 'Backspace'],
};
const PAD: Record<Action, number[]> = {
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  use: [2],
  interact: [0],
  dash: [1],
  magic: [3],
  item: [7, 6],
  prev: [4],
  next: [5],
  inventory: [8],
  pause: [9],
  confirm: [0],
  cancel: [1],
};

const HOTBAR_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const DEADZONE = 0.3;

export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  private padPrev: boolean[][] = [[], [], [], []];
  private padNow: boolean[][] = [[], [], [], []];
  private padAxes: number[][] = [[], [], [], []];
  private repeat = new Map<string, number>();
  mouse = { x: 0, y: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0, lastMove: -1e9 };
  /** 2P가 키보드 오른쪽을 쓰면 1P는 방향키를 내준다. */
  kb2Active = false;
  /** 마지막으로 무언가 눌린 장치(타이틀에서 1P 장치 결정용) */
  lastDevice: DeviceId | null = null;
  time = 0;
  textFocus = false;

  constructor(screen: Screen) {
    window.addEventListener('keydown', (e) => {
      if (this.textFocus) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'Backspace'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedSet.add(e.code);
      this.down.add(e.code);
      this.lastDevice = 'kbm';
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.left = this.mouse.right = false;
    });
    const c = screen.canvas;
    c.addEventListener('mousemove', (e) => {
      const v = screen.toVirtual(e.clientX, e.clientY);
      this.mouse.x = v.x;
      this.mouse.y = v.y;
      this.mouse.lastMove = this.time;
    });
    c.addEventListener('mousedown', (e) => {
      const v = screen.toVirtual(e.clientX, e.clientY);
      this.mouse.x = v.x;
      this.mouse.y = v.y;
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftPressed = true;
      } else if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightPressed = true;
      }
      this.mouse.lastMove = this.time;
      this.lastDevice = 'kbm';
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      else if (e.button === 2) this.mouse.right = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.mouse.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
  }

  /** 프레임 시작에 게임패드를 읽는다. */
  poll(dt: number): void {
    this.time += dt;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      this.padPrev[i] = this.padNow[i]!;
      const p = pads[i];
      if (p && p.connected) {
        this.padNow[i] = p.buttons.map((b) => b.pressed || b.value > 0.5);
        this.padAxes[i] = [...p.axes];
        if (this.padNow[i]!.some((b, j) => b && !this.padPrev[i]![j])) this.lastDevice = `pad${i}` as DeviceId;
      } else {
        this.padNow[i] = [];
        this.padAxes[i] = [];
      }
    }
  }

  /** 프레임 끝에 '이번 프레임에 눌림' 상태를 비운다. */
  endFrame(): void {
    this.pressedSet.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.wheel = 0;
  }

  padConnected(i: number): boolean {
    return (this.padNow[i]?.length ?? 0) > 0;
  }

  private keysFor(dev: DeviceId, a: Action): string[] {
    if (dev === 'kb2') return KB2[a];
    if (dev !== 'kbm') return [];
    let k = KBM_BASE[a];
    if (this.kb2Active) {
      const taken = new Set(Object.values(KB2).flat());
      k = k.filter((x) => !taken.has(x));
    }
    return k;
  }

  held(dev: DeviceId, a: Action): boolean {
    if (dev.startsWith('pad')) {
      const i = Number(dev[3]);
      const b = this.padNow[i]!;
      if (PAD[a].some((j) => b[j])) return true;
      const ax = this.padAxes[i]!;
      if (a === 'left') return (ax[0] ?? 0) < -0.5;
      if (a === 'right') return (ax[0] ?? 0) > 0.5;
      if (a === 'up') return (ax[1] ?? 0) < -0.5;
      if (a === 'down') return (ax[1] ?? 0) > 0.5;
      return false;
    }
    if (dev === 'kbm') {
      if (a === 'use' && this.mouse.left) return true;
      if (a === 'magic' && this.mouse.right) return true;
    }
    return this.keysFor(dev, a).some((k) => this.down.has(k));
  }

  pressed(dev: DeviceId, a: Action): boolean {
    if (dev.startsWith('pad')) {
      const i = Number(dev[3]);
      const now = this.padNow[i]!;
      const prev = this.padPrev[i]!;
      return PAD[a].some((j) => now[j] && !prev[j]);
    }
    if (dev === 'kbm') {
      if (a === 'use' && this.mouse.leftPressed) return true;
      if (a === 'magic' && this.mouse.rightPressed) return true;
      if (a === 'next' && this.mouse.wheel > 0) return true;
      if (a === 'prev' && this.mouse.wheel < 0) return true;
    }
    return this.keysFor(dev, a).some((k) => this.pressedSet.has(k));
  }

  /** 메뉴 이동용: 처음 누를 때 + 길게 누르면 반복 */
  nav(dev: DeviceId, a: 'up' | 'down' | 'left' | 'right'): boolean {
    const key = `${dev}:${a}`;
    // 한 프레임보다 짧게 눌렀다 뗀 키도 놓치지 않는다.
    if (this.pressed(dev, a)) {
      this.repeat.set(key, this.time + 0.32);
      return true;
    }
    if (!this.held(dev, a)) {
      this.repeat.delete(key);
      return false;
    }
    const t = this.repeat.get(key);
    if (t === undefined) {
      this.repeat.set(key, this.time + 0.32);
      return true;
    }
    if (this.time >= t) {
      this.repeat.set(key, this.time + 0.08);
      return true;
    }
    return false;
  }

  /** 이동 벡터(-1..1). 게임패드는 아날로그 스틱. */
  move(dev: DeviceId): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (dev.startsWith('pad')) {
      const ax = this.padAxes[Number(dev[3])]!;
      const sx = ax[0] ?? 0;
      const sy = ax[1] ?? 0;
      if (Math.hypot(sx, sy) > DEADZONE) {
        x = sx;
        y = sy;
      }
    }
    if (this.held(dev, 'left')) x = -1;
    if (this.held(dev, 'right')) x = 1;
    if (this.held(dev, 'up')) y = -1;
    if (this.held(dev, 'down')) y = 1;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  /** 게임패드 오른쪽 스틱 조준 방향(없으면 null) */
  stickAim(dev: DeviceId): { x: number; y: number } | null {
    if (!dev.startsWith('pad')) return null;
    const ax = this.padAxes[Number(dev[3])]!;
    const x = ax[2] ?? 0;
    const y = ax[3] ?? 0;
    return Math.hypot(x, y) > 0.5 ? { x, y } : null;
  }

  /** 마우스를 최근 2초 안에 움직였는지(조준·타일 지정에 마우스를 쓸지) */
  mouseActive(): boolean {
    return this.time - this.mouse.lastMove < 2;
  }

  hotbarKey(): number | null {
    for (let i = 0; i < HOTBAR_KEYS.length; i++) if (this.pressedSet.has(HOTBAR_KEYS[i]!)) return i;
    return null;
  }

  keyPressed(code: string): boolean {
    return this.pressedSet.has(code);
  }

  anyPressed(): boolean {
    if (this.pressedSet.size > 0 || this.mouse.leftPressed) return true;
    for (let i = 0; i < 4; i++) if (this.padNow[i]!.some((b, j) => b && !this.padPrev[i]![j])) return true;
    return false;
  }

  /** 아직 참가하지 않은 장치의 '참가' 입력. 패드는 Start/A, 키보드는 Enter. */
  pollJoin(taken: readonly DeviceId[]): DeviceId | null {
    for (let i = 0; i < 4; i++) {
      const id = `pad${i}` as DeviceId;
      if (taken.includes(id)) continue;
      const now = this.padNow[i]!;
      const prev = this.padPrev[i]!;
      if ((now[9] && !prev[9]) || (now[0] && !prev[0])) return id;
    }
    if (this.pressedSet.has('Enter')) {
      if (!taken.includes('kbm')) return 'kbm';
      if (!taken.includes('kb2')) return 'kb2';
    }
    return null;
  }
}

export function deviceLabel(d: DeviceId): string {
  if (d === 'kbm') return '키보드·마우스';
  if (d === 'kb2') return '키보드 방향키';
  return `게임패드 ${Number(d[3]) + 1}`;
}
