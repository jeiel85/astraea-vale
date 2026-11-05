import { SPECIES } from './data/animals';
import type { GoalId } from './data/goals';
import { GOALS, VILLAGE_RANK_NAMES } from './data/goals';
import { displayName, itemDef, sellValue, type Quality } from './data/items';
import { npcDef, type NpcId } from './data/npcs';
import { audio } from './engine/audio';
import { deviceLabel, Input, type DeviceId } from './engine/input';
import { Rng } from './engine/rng';
import { Screen, VH, VW } from './engine/screen';
import { FESTIVAL_END, FESTIVAL_START, isFestivalDay, isNight } from './sim/calendar';
import { advanceDay } from './sim/day';
import { completeGoal, villageRank } from './sim/goals';
import { addItem, countItem, removeItem, takeFromSlot } from './sim/inventory';
import { buyAnimal } from './sim/livestock';
import { loadFrom, saveTo } from './sim/save';
import { canGift, danceAtFestival, giveGift, hearts, talk } from './sim/social';
import { newGame, SWORD_NAMES, type GameState } from './sim/state';
import { bar, keyHint, panel, text, UI, type Ctx } from './ui/draw';
import { drawHud, type Toast } from './ui/hud';
import { josa } from './ui/josa';
import { LookbookModal } from './ui/lookbook';
import {
  BarnModal,
  CONTROLS_BODY,
  CraftModal,
  DaySummaryModal,
  DialogueModal,
  goalsBody,
  InfoModal,
  InventoryModal,
  ListMenuModal,
  ObservatoryModal,
  ShopModal,
  UpgradeModal,
  WeaveModal,
  type DChoice,
  type Speaker,
} from './ui/menus';
import { ConfirmModal, isConfirm, ModalStack, type Modal } from './ui/modal';
import { TitleScreen } from './ui/title';
import type { NpcEnt, Player } from './world/entities';
import type { Interaction, MapObj } from './world/maps';
import { MATRIARCH_FLOOR, type MonsterType } from './world/mine';
import { World, type WorldHost } from './world/world';

const SETTINGS_KEY = 'astraea-vale/settings';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class Game implements WorldHost {
  readonly screen: Screen;
  readonly input: Input;
  readonly ui = new ModalStack();
  state!: GameState;
  world!: World;
  rng = new Rng(1);
  settings = { shake: true };
  mode: 'title' | 'play' = 'title';
  private title: TitleScreen;
  private toasts: Toast[] = [];
  private slotFlash = { t: 0, slot: -1 };
  private ending = false;
  private last = 0;
  private saveError: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.screen = new Screen(canvas);
    this.input = new Input(this.screen);
    try {
      const raw = storage()?.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.settings, JSON.parse(raw));
    } catch {
      /* 설정이 깨졌으면 기본값을 쓴다 */
    }
    this.title = new TitleScreen(() => this.hasSave(), () => this.saveError);
  }

  start(): void {
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ── 저장 ─────────────────────────────────────────
  private hasSave(): boolean {
    const st = storage();
    if (!st) return false;
    const r = loadFrom(st);
    if (r && !r.ok) this.saveError = r.reason;
    return !!r && r.ok;
  }

  private saveNow(): string {
    const st = storage();
    if (!st) return '이 브라우저에서는 저장할 수 없다(저장소 차단).';
    this.state.rngState = this.rng.state;
    const r = saveTo(st, this.state);
    return r.ok ? '저장했다.' : r.reason;
  }

  private beginPlay(s: GameState, dev: DeviceId): void {
    this.state = s;
    this.rng = new Rng(1);
    this.rng.state = s.rngState;
    this.world = new World(this);
    this.world.addPlayer(dev);
    this.world.enter('farm');
    this.mode = 'play';
    this.ui.clear();
    if (!s.introSeen) this.intro(dev);
  }

  private intro(dev: DeviceId): void {
    const lyra = npcDef('lyra');
    this.ui.push(
      new DialogueModal(dev, [
        '아스트레아 베일. 한때 별빛이 땅에 내려앉아 무엇이든 자라나던 골짜기.',
        '십 년 전 \'검은 일식\'이 하늘을 가른 뒤, 마력이 폭주해 들판은 메마르고 광산 깊은 곳에선 괴물이 깨어났다.',
        `${this.state.playerName}은(는) 할머니가 남긴 별빛 지팡이와 낡은 천문 농장을 물려받아 골짜기로 돌아왔다.`,
      ]),
    ).onClose = () => {
      this.ui.push(
        new DialogueModal(dev, [
          { text: `어서 와요, ${this.state.playerName}님! 저는 마을의 별지기 리라예요.`, expr: 'happy' },
          '집 앞 밭에 괭이로 흙을 갈고 씨앗을 심은 뒤 물을 주세요. 다 자라면 수확해서 집 옆 출하함에 넣으면 돼요.',
          '맑은 밤에는 별빛 지팡이로 밭 위에 그날 밤의 별자리를 엮을 수 있어요. 별자리마다 작물에 다른 축복이 깃들죠.',
          '북쪽 관측소에서 달과 일식 예보를 꼭 확인하세요. 오른쪽 길은 마을, 남동쪽 동굴은… 괴물이 사는 광산이에요.',
          { text: '골짜기를 다시 별빛으로 채워 주세요. 기대할게요!', expr: 'happy' },
        ], { id: lyra.id, name: lyra.name, look: lyra.look }),
      );
      this.state.introSeen = true;
    };
  }

  // ── 프레임 ───────────────────────────────────────
  private frame(dt: number): void {
    const inp = this.input;
    inp.poll(dt);
    if (this.mode === 'title') {
      if (this.ui.open) this.ui.update(dt, inp);
      else {
        const act = this.title.update(dt, inp);
        if (act) this.titleAction(act);
      }
      const c = this.screen.beginUI();
      this.screen.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.screen.ctx.fillStyle = '#0b0a1a';
      this.screen.ctx.fillRect(0, 0, this.screen.canvas.width, this.screen.canvas.height);
      this.screen.beginUI();
      this.title.draw(c);
      this.ui.draw(c);
      inp.endFrame();
      return;
    }
    // 창을 닫은 바로 그 키가 월드 입력(예: Esc → 메뉴)으로 다시 쓰이지 않게, 창이 열려 있던 프레임은 월드를 멈춘다.
    const hadModal = this.ui.open;
    if (hadModal) this.ui.update(dt, inp);
    else this.pollJoin();
    this.world.update(dt, this.ui.pausing || (hadModal && !this.ui.open));
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);
    const p0 = this.world.players[0];
    if (p0 && p0.slot !== this.slotFlash.slot) this.slotFlash = { t: 1.6, slot: p0.slot };
    if (this.slotFlash.t > 0) this.slotFlash.t -= dt;
    this.world.draw(this.screen.wctx);
    this.screen.present();
    const c = this.screen.beginUI();
    drawHud(c, this.state, this.world, this.toasts, this.slotFlash);
    this.ui.draw(c);
    inp.endFrame();
  }

  private titleAction(a: 'new' | 'continue' | 'controls' | 'settings'): void {
    const dev = this.title.owner;
    if (a === 'continue') {
      const st = storage();
      const r = st ? loadFrom(st) : null;
      if (!r || !r.ok) {
        this.saveError = r && !r.ok ? r.reason : '저장 데이터가 없습니다.';
        audio.sfx('error');
        return;
      }
      this.beginPlay(r.state, dev);
      this.toast(`${this.state.playerName}의 농장으로 돌아왔다.`, UI.gold);
    } else if (a === 'new') {
      const go = () => {
        void this.promptText('농부의 이름을 지어 주세요', '아스트라').then((name) => {
          if (name === null) return;
          const nm = name.trim().slice(0, 10) || '아스트라';
          const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
          this.beginPlay(newGame(seed, nm), dev);
        });
      };
      if (this.hasSave()) this.ui.push(new ConfirmModal(dev, '새 게임을 시작하면 기존 저장이 다음 잠자리에서 덮어써집니다. 시작할까요?', [{ label: '새로 시작', act: go }, { label: '취소', act: () => {} }]));
      else go();
    } else if (a === 'controls') this.ui.push(new InfoModal(dev, '조작법', () => CONTROLS_BODY));
    else this.ui.push(new SettingsModal(dev, this));
  }

  /** DOM 입력창으로 글자(한글 IME 포함)를 받는다 */
  promptText(title: string, initial: string, maxLength = 20): Promise<string | null> {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'prompt';
      const label = document.createElement('div');
      label.textContent = title;
      const input = document.createElement('input');
      input.value = initial;
      input.maxLength = maxLength;
      const row = document.createElement('div');
      const ok = document.createElement('button');
      ok.textContent = '확인';
      const cancel = document.createElement('button');
      cancel.textContent = '취소';
      row.append(ok, cancel);
      wrap.append(label, input, row);
      document.body.appendChild(wrap);
      this.input.textFocus = true;
      const focus = () => {
        input.focus();
        input.select();
      };
      focus();
      setTimeout(focus, 0);
      // 입력창에 포커스가 없어도 Enter/Esc로 닫히게 창 전체에서 먼저 받는다(게임 입력으로 새지 않게 막음).
      const onKey = (e: KeyboardEvent) => {
        if (e.isComposing) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          finish(input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      };
      window.addEventListener('keydown', onKey, true);
      const finish = (v: string | null) => {
        window.removeEventListener('keydown', onKey, true);
        wrap.remove();
        this.input.textFocus = false;
        resolve(v);
      };
      ok.onclick = () => finish(input.value);
      cancel.onclick = () => finish(null);
    });
  }

  // ── 협동 참가 ─────────────────────────────────────
  private pollJoin(): void {
    if (this.world.players.length >= 4 || this.world.transitioning) return;
    const taken = this.world.players.map((p) => p.dev);
    const dev = this.input.pollJoin(taken);
    if (!dev) return;
    if (dev === 'kb2') this.input.kb2Active = true;
    const p = this.world.addPlayer(dev);
    audio.sfx('levelUp');
    this.toast(`${p.index + 1}P 참가! (${deviceLabel(dev)})`, UI.mint);
  }

  // ── WorldHost ────────────────────────────────────
  toast(msg: string, color: string = UI.text): void {
    this.toasts.push({ msg, color, life: 4 });
    if (this.toasts.length > 8) this.toasts.shift();
  }


  goal(id: GoalId): void {
    const before = villageRank(this.state);
    if (!completeGoal(this.state, id)) return;
    const g = GOALS.find((x) => x.id === id)!;
    audio.sfx('fanfare');
    this.toast(`★ 목표 달성: ${g.name}`, UI.gold);
    const after = villageRank(this.state);
    if (after > before) {
      this.toast(`마을 등급이 올랐다! ${VILLAGE_RANK_NAMES[after]} — 광장이 새로 꾸며졌다.`, UI.pink);
      this.world.rebuildSolid();
    }
  }

  endDay(fainted: boolean, reason?: string): void {
    if (this.ending) return;
    this.ending = true;
    const owner = this.world.players[0]?.dev ?? 'kbm';
    this.ui.clear();
    this.world.transition(() => {
      const sum = advanceDay(this.state, fainted);
      this.world.restoreForNewDay();
      if (fainted) for (const p of this.world.players) p.energy = Math.round(p.energy * 0.6);
      this.world.enter('farm', { tx: 7, ty: 10 });
      const msg = this.saveNow();
      audio.sfx('sleep');
      this.ui.push(new DaySummaryModal(owner, sum, reason ?? null, msg));
      this.ending = false;
      if (isFestivalDay(this.state.day)) this.toast('오늘은 별빛 수확제! 저녁 5시에 마을 광장으로.', UI.pink);
    }, true);
  }

  openPause(p: Player): void {
    const dev = p.dev;
    this.ui.push(
      new ListMenuModal(dev, '메뉴', [
        { label: '계속하기', act: () => this.closeTop() },
        { label: '목표 · 마을 등급', act: () => this.ui.push(new InfoModal(dev, '목표와 마을 재건', () => goalsBody(this.state))) },
        { label: '가방', act: () => this.openInventory(p) },
        { label: '룩북 에디터', act: () => this.openLookbook(dev) },
        { label: '협동 플레이', act: () => this.openCoop(dev) },
        { label: '조작법', act: () => this.ui.push(new InfoModal(dev, '조작법', () => CONTROLS_BODY)) },
        { label: '설정', act: () => this.ui.push(new SettingsModal(dev, this)) },
        {
          label: '타이틀로',
          act: () =>
            this.ui.push(
              new ConfirmModal(dev, '저장은 잠자리에 들 때만 됩니다. 오늘 진행은 사라집니다. 타이틀로 갈까요?', [
                {
                  label: '타이틀로',
                  act: () => {
                    this.ui.clear();
                    this.mode = 'title';
                    this.input.kb2Active = false;
                    this.title.refresh();
                    audio.music('title');
                  },
                },
                { label: '취소', act: () => {} },
              ]),
            ),
        },
      ], `${p.index + 1}P · ${deviceLabel(dev)}`),
    );
  }

  private closeTop(): void {
    const t = this.ui.top;
    if (t) t.done = true;
  }

  private openCoop(dev: DeviceId): void {
    const items = this.world.players.slice(1).map((p) => ({
      label: `${p.index + 1}P 내보내기 (${deviceLabel(p.dev)})`,
      act: () => {
        if (p.dev === 'kb2') this.input.kb2Active = false;
        this.world.removePlayer(p.index);
        this.toast(`${p.index + 1}P가 떠났다.`);
        this.closeTop();
      },
    }));
    items.push({ label: '닫기', act: () => this.closeTop() });
    this.ui.push(new ListMenuModal(dev, `협동 플레이 (${this.world.players.length}/4)`, items, '참가: 패드 Start/A 또는 키보드 Enter'));
  }

  openInventory(p: Player): void {
    const m = new InventoryModal(p.dev, this, { title: `가방 · ${p.index + 1}P` }, p);
    m.useCb = (slot) => this.world.useConsumable(p, slot);
    this.ui.push(m);
  }

  openLookbook(dev: DeviceId): void {
    this.ui.push(
      new LookbookModal(dev, {
        state: this.state,
        toast: (m, c) => this.toast(m, c),
        promptText: (t, i, m) => this.promptText(t, i, m),
        onAppearanceChanged: () => {
          this.world.refreshPlayerLook();
          this.world.rebuildSolid();
        },
      }),
    );
  }

  openWeave(p: Player, tx: number, ty: number): void {
    const radius = this.state.staffLevel > 0 ? 2 : 1;
    this.ui.push(new WeaveModal(p.dev, this, p, tx, ty, radius, this.state.staffLevel > 0 ? 3 : 0, () => {}));
  }

  interact(kind: Interaction, p: Player, _obj: MapObj | null): void {
    const dev = p.dev;
    const s = this.state;
    switch (kind) {
      case 'sleep':
        this.ui.push(
          new ConfirmModal(dev, isNight(s.minutes) ? '포근한 집이다. 잠자리에 들까요? (저장됩니다)' : '아직 낮이다. 그래도 잠자리에 들까요? (저장됩니다)', [
            { label: '잠자기', act: () => this.endDay(false) },
            { label: '옷장 (룩북 에디터)', act: () => this.openLookbook(dev) },
            { label: '취소', act: () => {} },
          ]),
        );
        return;
      case 'ship':
        this.ui.push(
          new InventoryModal(dev, this, {
            title: '출하함 — 밤사이 값을 쳐 준다',
            filter: (st) => itemDef(st.id).price > 0,
            keepOpen: true,
            onPick: (slot) => {
              const st = takeFromSlot(s.inventory, slot, 999);
              if (!st) return;
              s.shippingBin.push(st);
              audio.sfx('coin');
              this.toast(`${displayName(st.id, st.q)} ×${st.n} 출하 (${(sellValue(st.id, st.q) * st.n).toLocaleString('ko-KR')}G)`, UI.gold);
            },
            footer: () => {
              const total = s.shippingBin.reduce((a, x) => a + sellValue(x.id, x.q) * x.n, 0);
              return `확인: 한 묶음 넣기 · 출하함 ${s.shippingBin.length}묶음, 예상 ${total.toLocaleString('ko-KR')}G`;
            },
          }),
        );
        return;
      case 'craft':
        this.ui.push(new CraftModal(dev, this));
        return;
      case 'observatory':
      case 'telescope':
        this.ui.push(new ObservatoryModal(dev, this));
        this.goal('observatory');
        return;
      case 'mine': {
        const choices: DChoice[] = [{ label: '1층부터', act: () => this.world.enterMineFloor(1) }];
        if (s.mine.checkpoint > 1) choices.push({ label: `${s.mine.checkpoint}층부터`, act: () => this.world.enterMineFloor(s.mine.checkpoint) });
        choices.push({ label: '그만두기', act: () => {} });
        const late = s.minutes >= 22 * 60 ? ' 밤이 깊었다. 새벽 2시가 되면 쓰러진다.' : '';
        this.ui.push(new DialogueModal(dev, [`광산 입구다. 차가운 바람과 함께 괴물의 기척이 느껴진다.${late}`], null, choices));
        return;
      }
      case 'barn':
        this.ui.push(
          new BarnModal(dev, this, (msg, mutated, variant) => {
            this.world.syncAnimals();
            this.toast(msg, mutated ? UI.pink : UI.mint);
            if (mutated) this.toast('돌연변이! 혈통에 별빛이 깃들었다.', UI.gold);
            if (variant !== 'standard') this.goal('mutation');
          }),
        );
        return;
      case 'fountain':
        this.ui.push(new DialogueModal(dev, [villageRank(s) >= 4 ? '분수 바닥에서 별가루가 반짝인다. 골짜기가 다시 숨 쉬고 있다.' : '맑은 물이 솟는다. 예전엔 이 물에 별빛이 비쳤다고 한다.']));
        return;
      case 'banner':
        this.openLookbook(dev);
        return;
      default:
        return;
    }
  }

  talkTo(npc: NpcEnt, p: Player): void {
    const s = this.state;
    const def = npc.def;
    const id = def.id as NpcId;
    const speaker: Speaker = { id, name: def.name, look: def.look };
    const r = talk(s, id, this.rng);
    const h = hearts(s.npcs[id].affection);
    const choices: DChoice[] = [];
    const festival = isFestivalDay(s.day) && s.minutes >= FESTIVAL_START && s.minutes < FESTIVAL_END;
    if (def.services.includes('shop')) {
      const open = s.minutes >= 9 * 60 && s.minutes < 18 * 60 && !festival;
      choices.push({ label: open ? '물건 사기' : '물건 사기 (9~18시)', disabled: !open, act: () => this.openShop(p.dev) });
    }
    if (def.services.includes('forge')) choices.push({ label: '검 강화', act: () => this.openForge(p.dev) });
    if (def.services.includes('staff')) choices.push({ label: '지팡이 강화', act: () => this.openStaff(p.dev) });
    if (festival && def.services.includes('festival')) choices.push({ label: '수확제 작물 출품', disabled: s.festivalEntered.includes(s.day), act: () => this.festivalEntry(p.dev) });
    if (festival) choices.push({ label: `${def.name}에게 춤 신청`, disabled: s.festivalDanced.includes(s.day), act: () => this.dance(p.dev, id) });
    choices.push({ label: canGift(s, id) ? '선물하기' : '선물하기 (오늘 줌)', disabled: !canGift(s, id), act: () => this.openGift(p.dev, id) });
    choices.push({ label: '안녕', act: () => {} });
    if (r.event) {
      const lines = r.event.lines.map((t, i) => ({ text: t.replaceAll('{name}', s.playerName), expr: i === r.event!.lines.length - 1 ? ('happy' as const) : ('normal' as const) }));
      const reward = r.event.reward;
      this.ui.push(new DialogueModal(p.dev, lines, speaker)).onClose = () => {
        if (reward?.item) {
          const left = addItem(s.inventory, reward.item, reward.n ?? 1);
          if (left > 0) this.world.dropItem(p.x, p.y, reward.item, left);
          this.toast(`${def.name}에게서 ${itemDef(reward.item).name} ×${reward.n ?? 1}을(를) 받았다!`, UI.pink);
        }
        if (reward?.gold) {
          s.gold += reward.gold;
          this.toast(`${def.name}에게서 ${reward.gold}G를 받았다!`, UI.pink);
        }
        audio.sfx('heart');
      };
      return;
    }
    const lines = [{ text: r.line, expr: h >= 6 ? ('happy' as const) : ('normal' as const) }];
    this.ui.push(new DialogueModal(p.dev, lines, speaker, choices));
    if (r.firstToday) audio.sfx('heart', { volume: 0.4 });
  }

  private openGift(dev: DeviceId, id: NpcId): void {
    const s = this.state;
    const def = npcDef(id);
    this.ui.push(
      new InventoryModal(dev, this, {
        title: `${def.name}에게 줄 선물`,
        filter: (st) => itemDef(st.id).kind !== 'tool' && itemDef(st.id).kind !== 'key',
        onPick: (slot) => {
          const st = s.inventory[slot];
          if (!st) return;
          const q: Quality = st.q;
          removeItem(s.inventory, st.id, 1, q);
          const g = giveGift(s, id, st.id, q === 2 ? 0.5 : q === 1 ? 0.25 : 0);
          audio.sfx(g.reaction === 'dislike' ? 'error' : 'heart');
          const expr = g.reaction === 'love' || g.reaction === 'like' ? 'happy' : g.reaction === 'dislike' ? 'surprised' : 'normal';
          this.ui.push(new DialogueModal(dev, [{ text: g.text, expr }], { id, name: def.name, look: def.look }));
        },
      }),
    );
  }

  private openShop(dev: DeviceId): void {
    const s = this.state;
    this.ui.push(
      new ShopModal(dev, this, (e) => {
        if (e.kind === 'animal') {
          const err = buyAnimal(s, e.id as 'cow' | 'duck');
          if (!err) {
            this.world.syncAnimals();
            this.toast(`새끼 ${SPECIES[e.id as 'cow'].name}가 목장에 도착했다!`, UI.mint);
          }
          return err;
        }
        if (s.gold < e.price) return '골드가 부족하다.';
        if (addItem(s.inventory, e.id, 1) > 0) return '가방이 가득 찼다.';
        s.gold -= e.price;
        return null;
      }),
    );
  }

  private openForge(dev: DeviceId): void {
    const s = this.state;
    const tiers = [
      { cost: [{ id: 'copper', n: 6 }], gold: 600 },
      { cost: [{ id: 'moonsilver', n: 6 }], gold: 1500 },
      { cost: [{ id: 'star_crystal', n: 4 }, { id: 'relic', n: 1 }], gold: 3000 },
    ];
    this.ui.push(
      new UpgradeModal(dev, this, `브람의 대장간 · 지금 검: ${SWORD_NAMES[s.swordLevel]}`, () =>
        tiers.map((t, i) => ({
          name: SWORD_NAMES[i + 1]!,
          desc: `공격력 ${[8, 12, 17, 24][i + 1]} (지금 ${[8, 12, 17, 24][s.swordLevel]}). 콤보·돌진 베기·별빛 베기 모두 강해진다.`,
          cost: t.cost,
          gold: t.gold,
          available: s.swordLevel === i,
          doneLabel: s.swordLevel > i ? '완료' : s.swordLevel < i ? '잠김' : undefined,
          apply: () => {
            for (const c of t.cost) removeItem(s.inventory, c.id, c.n);
            s.gold -= t.gold;
            s.swordLevel = i + 1;
            this.toast(`${SWORD_NAMES[i + 1]}으로 강화했다!`, UI.gold);
          },
        })),
      ),
    );
  }

  private openStaff(dev: DeviceId): void {
    const s = this.state;
    this.ui.push(
      new UpgradeModal(dev, this, '리라의 별지팡이 조율', () => [
        {
          name: '별빛 지팡이 +1',
          desc: '마법 관개 범위 5×5 → 7×7, 별자리 룬 범위 3×3 → 5×5, 룬 엮기 시간 +3초.',
          cost: [{ id: 'star_crystal', n: 2 }],
          gold: 800,
          available: s.staffLevel === 0,
          doneLabel: s.staffLevel > 0 ? '완료' : undefined,
          apply: () => {
            removeItem(s.inventory, 'star_crystal', 2);
            s.gold -= 800;
            s.staffLevel = 1;
            this.toast('별빛 지팡이가 더 밝게 빛난다!', UI.gold);
          },
        },
      ]),
    );
  }

  private festivalEntry(dev: DeviceId): void {
    const s = this.state;
    const nova = npcDef('nova');
    this.ui.push(
      new InventoryModal(dev, this, {
        title: '별빛 수확제 — 출품할 작물',
        filter: (st) => itemDef(st.id).kind === 'crop',
        onPick: (slot) => {
          const st = s.inventory[slot];
          if (!st) return;
          removeItem(s.inventory, st.id, 1, st.q);
          const score = sellValue(st.id, st.q);
          const prize = score >= 900 ? 3000 : score >= 400 ? 1500 : score >= 150 ? 600 : 200;
          const rank = score >= 900 ? '황금 작물상' : score >= 400 ? '별빛상' : score >= 150 ? '은하수상' : '참가상';
          s.gold += prize;
          s.festivalEntered.push(s.day);
          audio.sfx('fanfare');
          this.goal('festival');
          this.ui.push(
            new DialogueModal(dev, [
              { text: `출품작은… ${displayName(st.id, st.q)}! 심사 점수 ${score}점!`, expr: 'surprised' },
              { text: `${rank}이야! 상금 ${prize.toLocaleString('ko-KR')}G를 받아 줘!`, expr: 'happy' },
            ], { id: 'nova', name: nova.name, look: nova.look }),
          );
        },
      }),
    );
  }

  private dance(dev: DeviceId, id: NpcId): void {
    const def = npcDef(id);
    if (!danceAtFestival(this.state, id)) return;
    audio.sfx('heart');
    this.ui.push(new DialogueModal(dev, [{ text: `등불 아래, ${josa(def.name, '과', '와')} 별빛 왈츠를 췄다.`, expr: 'normal' }, { text: def.lines.festival[0]!.replaceAll('{name}', this.state.playerName), expr: 'happy' }], { id, name: def.name, look: def.look }));
  }

  floorCleared(floor: number): void {
    const s = this.state;
    s.mine.deepest = Math.max(s.mine.deepest, floor);
    if (floor === 1) this.goal('mine1');
    this.toast(`광산 ${floor}층을 정화했다!`, UI.mint);
  }

  bossDefeated(type: MonsterType): void {
    const s = this.state;
    if (type === 'matriarch') {
      s.mine.matriarch = true;
      s.mine.checkpoint = Math.max(s.mine.checkpoint, MATRIARCH_FLOOR + 1);
      this.goal('matriarch');
      this.toast('정동석 여왕을 쓰러뜨렸다! 다음부터 6층에서 시작할 수 있다.', UI.gold);
    } else {
      const first = !s.mine.wyrm;
      s.mine.wyrm = true;
      this.goal('wyrm');
      if (first) this.showEnding();
    }
  }

  private showEnding(): void {
    const dev = this.world.players[0]?.dev ?? 'kbm';
    const s = this.state;
    setTimeout(() => {
      this.ui.push(
        new DialogueModal(dev, [
          '일식의 비룡이 마지막 숨을 내쉬자, 검은 태양이 작은 심장이 되어 손바닥 위로 떨어졌다.',
          '그 순간 광산 천장 틈으로 한 줄기 별빛이 내려왔다. 십 년 만에 골짜기가 하늘과 다시 이어졌다.',
          '들판의 룬이 일제히 빛나고, 광장의 등불이 저절로 켜졌다. 사람들은 그날 밤을 \'별이 돌아온 밤\'이라 불렀다.',
          `수확 ${s.stats.harvested} · 출하 ${s.stats.shipped} · 처치 ${s.stats.kills} · 룬 ${s.stats.woven}회 — ${s.playerName}의 이야기는 이제 막 시작되었다.`,
          'ASTRAEA VALE — 감사합니다! 농장 생활은 계속됩니다.',
        ]),
      );
      s.endingSeen = true;
      audio.music('title');
    }, 1200);
  }
}

/** 음량·화면 흔들림 설정 */
class SettingsModal implements Modal {
  done = false;
  pausesWorld = true;
  private row = 0;
  constructor(public owner: DeviceId, private game: Game) {}
  update(_dt: number, input: Input): void {
    const o = this.owner;
    if (input.nav(o, 'up')) this.row = (this.row + 4) % 5;
    if (input.nav(o, 'down')) this.row = (this.row + 1) % 5;
    const d = input.nav(o, 'left') ? -1 : input.nav(o, 'right') ? 1 : 0;
    const st = audio.getSettings();
    if (d !== 0 || isConfirm(input, o)) {
      const step = d === 0 ? 0 : d * 0.1;
      if (this.row === 0) audio.setSettings({ music: Math.max(0, Math.min(1, st.music + step)) });
      else if (this.row === 1) {
        audio.setSettings({ sfx: Math.max(0, Math.min(1, st.sfx + step)) });
        audio.sfx('coin');
      } else if (this.row === 2) audio.toggleMute();
      else if (this.row === 3) {
        this.game.settings.shake = !this.game.settings.shake;
        try {
          window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.game.settings));
        } catch {
          this.game.toast('설정을 저장하지 못했다(저장소 차단).', UI.red);
        }
      } else if (this.row === 4 && d === 0) this.done = true;
    }
    if (input.pressed(o, 'cancel')) this.done = true;
  }
  draw(c: Ctx): void {
    const st = audio.getSettings();
    const x = VW / 2 - 100;
    const y = VH / 2 - 56;
    panel(c, x, y, 200, 112);
    text(c, '설정', x + 100, y + 6, { align: 'center', color: UI.gold });
    const rows = ['배경음', '효과음', '음소거', '화면 흔들림', '닫기'];
    rows.forEach((r, i) => {
      const ry = y + 24 + i * 16;
      if (i === this.row) {
        c.fillStyle = 'rgba(200,168,255,0.22)';
        c.fillRect(x + 6, ry - 1, 188, 15);
      }
      text(c, r, x + 14, ry, { color: i === this.row ? UI.gold : UI.text });
      if (i === 0) bar(c, x + 90, ry + 4, 90, 5, st.music, UI.pink);
      if (i === 1) bar(c, x + 90, ry + 4, 90, 5, st.sfx, UI.sky);
      if (i === 2) text(c, st.muted ? '켬' : '끔', x + 186, ry, { align: 'right' });
      if (i === 3) text(c, this.game.settings.shake ? '켬' : '끔', x + 186, ry, { align: 'right' });
    });
    keyHint(c, x + 100, y + 100, '←→ 조절 · 확인 전환 · 취소 닫기', 'center');
  }
}

export { countItem };
