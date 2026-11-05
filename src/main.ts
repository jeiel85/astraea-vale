import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import galmuri9 from 'galmuri/dist/Galmuri9.woff2?url';
import { Game } from './game';
import './style.css';

async function loadFonts(): Promise<void> {
  const faces = [new FontFace('Galmuri11', `url(${galmuri11})`), new FontFace('Galmuri9', `url(${galmuri9})`)];
  await Promise.all(
    faces.map(async (f) => {
      try {
        document.fonts.add(await f.load());
      } catch (e) {
        // 글꼴을 못 받아도 게임은 기본 글꼴로 진행한다(화면에는 그대로 보인다).
        console.warn('글꼴을 불러오지 못했습니다:', e);
      }
    }),
  );
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game 캔버스가 없습니다.');
  await loadFonts();
  document.getElementById('loading')?.remove();
  const game = new Game(canvas);
  // 개발 서버에서만 콘솔 점검용으로 노출한다(배포 빌드에서는 제거된다).
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  game.start();
}

boot().catch((e: unknown) => {
  const el = document.getElementById('loading');
  if (el) el.textContent = `게임을 시작하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`;
  console.error(e);
});
