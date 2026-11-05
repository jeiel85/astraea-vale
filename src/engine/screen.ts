/** 가상 해상도. 월드는 이 크기의 오프스크린 캔버스에 그린 뒤 정수 배로 확대한다. */
export const VW = 384;
export const VH = 216;
export const TILE = 16;

export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly world: HTMLCanvasElement;
  readonly wctx: CanvasRenderingContext2D;
  scale = 1;
  ox = 0;
  oy = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D를 사용할 수 없습니다.');
    this.ctx = ctx;
    this.world = document.createElement('canvas');
    this.world.width = VW;
    this.world.height = VH;
    const w = this.world.getContext('2d');
    if (!w) throw new Error('Canvas 2D를 사용할 수 없습니다.');
    this.wctx = w;
    this.wctx.imageSmoothingEnabled = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    const W = Math.floor(window.innerWidth * this.dpr);
    const H = Math.floor(window.innerHeight * this.dpr);
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    const s = Math.min(W / VW, H / VH);
    const si = Math.floor(s);
    this.scale = si >= 1 && si / s >= 0.8 ? si : s;
    this.ox = Math.floor((W - VW * this.scale) / 2);
    this.oy = Math.floor((H - VH * this.scale) / 2);
  }

  /** 월드 버퍼를 화면에 확대해 옮긴다. */
  present(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0b0a1a';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.world, this.ox, this.oy, VW * this.scale, VH * this.scale);
  }

  /** UI는 가상 좌표로 그리되 실제 해상도로 렌더되어 글자가 선명하다. */
  beginUI(): CanvasRenderingContext2D {
    const c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    c.imageSmoothingEnabled = false;
    return c;
  }

  toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    return {
      x: (clientX * this.dpr - this.ox) / this.scale,
      y: (clientY * this.dpr - this.oy) / this.scale,
    };
  }
}
