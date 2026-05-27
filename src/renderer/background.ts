import { Size } from '../core/types.ts';

export class BackgroundRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dirty = true;
  private moduleSize: Size = { width: 800, height: 600 };

  constructor(private readonly container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.zIndex = '1';
    this.ctx = this.canvas.getContext('2d')!;
    this.container.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      this.dirty = true;
    });
    this.loop();
  }

  setModuleSize(size: Size): void {
    this.moduleSize = size;
    this.dirty = true;
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private loop(): void {
    const frame = () => {
      if (this.dirty) {
        this.draw();
        this.dirty = false;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  markDirty(): void {
    this.dirty = true;
  }

  private draw(): void {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(0, 0, w, h);
    this.drawGrid(w, h, 20);
    this.drawRoomBounds();
  }

  private drawGrid(width: number, height: number, step: number): void {
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += step) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
    }
    this.ctx.stroke();

    this.ctx.strokeStyle = '#cbd5e1';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    for (let x = 0; x <= width; x += step * 5) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += step * 5) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
    }
    this.ctx.stroke();
  }

  private drawRoomBounds(): void {
    const { width, height } = this.moduleSize;
    this.ctx.strokeStyle = '#94a3b8';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([8, 4]);
    this.ctx.strokeRect(0, 0, width, height);
    this.ctx.setLineDash([]);
  }

  destroy(): void {
    this.canvas.remove();
  }
}
