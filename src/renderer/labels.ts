import { Point } from '../core/types.ts';

export function drawLabel(ctx: CanvasRenderingContext2D, text: string, position: Point, scale: number = 1): void {
  ctx.save();
  ctx.font = `bold ${13 * scale}px 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const w = metrics.width + 8 * scale;
  const h = 20 * scale;
  const x = position.x;
  const y = position.y - h / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(15,23,42,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5 * scale);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.fillText(text, x + 4 * scale, position.y);
  ctx.restore();
}

export function drawNodeLabel(ctx: CanvasRenderingContext2D, text: string, position: Point, scale: number = 1): void {
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${11 * scale}px 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, position.x, position.y + 18 * scale);
  ctx.restore();
}

export function generateWireLabel(index: number): string {
  const subs = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  const digits = String(index)
    .split('')
    .map((d) => subs[Number(d)]);
  return 'w' + digits.join('');
}
