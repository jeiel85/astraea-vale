import { charSprite } from '../art/characters';
import { NPCS } from '../data/npcs';
import { audio } from '../engine/audio';
import type { DeviceId, Input } from '../engine/input';
import { VH, VW } from '../engine/screen';
import { keyHint, panel, text, UI, type Ctx } from './draw';
import { ListNav } from './modal';

export type TitleAction = 'new' | 'continue' | 'controls' | 'settings';

export class TitleScreen {
  private t = 0;
  private nav: ListNav;
  private started = false;
  owner: DeviceId = 'kbm';
  constructor(private hasSave: () => boolean, private saveError: () => string | null) {
    this.nav = new ListNav([], 5);
    this.refresh();
  }
  refresh(): void {
    const save = this.hasSave();
    this.nav.items = [
      { label: '이어하기', disabled: !save },
      { label: '새 게임' },
      { label: '조작법' },
      { label: '설정' },
    ];
    this.nav.index = save ? 0 : 1;
  }
  /** 선택한 메뉴를 돌려준다 */
  update(dt: number, input: Input): TitleAction | null {
    this.t += dt;
    if (!this.started) {
      if (input.anyPressed()) {
        this.started = true;
        this.owner = input.lastDevice ?? 'kbm';
        audio.unlock();
        audio.music('title');
        audio.sfx('confirm');
      }
      return null;
    }
    const r = this.nav.update(input, this.owner, { x: VW / 2 - 60, y: 140, w: 120, rowH: 15 });
    if (r === 'confirm') {
      audio.sfx('confirm');
      return (['continue', 'new', 'controls', 'settings'] as const)[this.nav.index]!;
    }
    return null;
  }
  draw(c: Ctx): void {
    const g = c.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#0f0a2a');
    g.addColorStop(0.6, '#3a2060');
    g.addColorStop(1, '#a04a8a');
    c.fillStyle = g;
    c.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 110; i++) {
      const tw = (Math.sin(this.t * 2 + i * 1.7) + 1) / 2;
      c.fillStyle = tw > 0.8 ? '#ffffff' : i % 7 === 0 ? '#ffe27a' : '#8a7ab0';
      c.fillRect((i * 127) % VW, (i * 53) % 150, 1, 1);
    }
    // 유성
    const m = (this.t * 0.6) % 3;
    if (m < 0.6) {
      const k = m / 0.6;
      c.strokeStyle = 'rgba(255,240,200,0.8)';
      c.beginPath();
      c.moveTo(300 - k * 160, 20 + k * 60);
      c.lineTo(300 - k * 160 + 18, 20 + k * 60 - 7);
      c.stroke();
    }
    // 언덕과 별 농장 실루엣
    c.fillStyle = '#20143a';
    c.beginPath();
    c.moveTo(0, VH);
    for (let x = 0; x <= VW; x += 8) c.lineTo(x, 170 + Math.sin(x * 0.02) * 10 + Math.sin(x * 0.05) * 4);
    c.lineTo(VW, VH);
    c.fill();
    c.fillStyle = '#2a1a48';
    c.fillRect(300, 150, 30, 24);
    c.beginPath();
    c.moveTo(296, 152);
    c.lineTo(315, 136);
    c.lineTo(334, 152);
    c.fill();
    c.fillStyle = '#ffe9a0';
    c.fillRect(306, 158, 6, 6);
    // 주민들
    NPCS.forEach((n, i) => {
      const spr = charSprite(n.look, 'down', Math.floor(this.t * 2 + i) % 3 === 1 ? 1 : 0);
      c.drawImage(spr, 40 + i * 22, 168 + Math.round(Math.sin(this.t * 3 + i) * 1.5));
    });
    // 로고
    const bob = Math.round(Math.sin(this.t * 1.5) * 2);
    text(c, 'ASTRAEA VALE', VW / 2, 34 + bob, { size: 32, align: 'center', color: '#ffe27a', shadow: '#5a2a7a' });
    text(c, '아스트레아 베일', VW / 2, 72 + bob, { size: 16, align: 'center', color: '#ffffff', shadow: '#5a2a7a' });
    text(c, '별빛 농장과 연금술 던전', VW / 2, 94, { size: 10, align: 'center', color: '#ffd0ec' });
    if (!this.started) {
      if (Math.floor(this.t * 2) % 2 === 0) text(c, '아무 키나 누르세요 (게임패드 가능)', VW / 2, 150, { align: 'center', color: UI.text });
    } else {
      panel(c, VW / 2 - 66, 132, 132, 72, { alpha: 0.85 });
      this.nav.draw(c, VW / 2 - 60, 140, 120, 15);
      const err = this.saveError();
      if (err) text(c, err, VW / 2, 120, { size: 10, align: 'center', color: UI.red });
    }
    keyHint(c, VW - 4, VH - 12, `v${__APP_VERSION__} · 코드 MIT · 콘텐츠 CC BY 4.0`, 'right');
  }
}
