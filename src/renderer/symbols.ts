import { ComponentType, Point } from '../core/types.ts';

const BASE = 26;

export function getNodeScale(connCount: number): number {
  return 1 + Math.min(6.0, connCount * 0.65);
}

export function getSymbolHalfSize(type: ComponentType, extraScale = 1): { hw: number; hh: number } {
  const s = BASE * extraScale;
  switch (type) {
    case 'junction_box': {
      const pad = s * 0.12;
      return { hw: (s - pad * 2) / 2, hh: (s - pad * 2) / 2 };
    }
    case 'outlet':
      return { hw: s / 2.2, hh: s / 2.2 };
    case 'switch':
      return { hw: s * 0.55, hh: s * 0.55 };
    case 'lamp':
      return { hw: s * 0.32, hh: s * 0.32 };
    case 'panel': {
      const pw = s * 1.1;
      const ph = s * 0.85;
      return { hw: pw / 2, hh: ph / 2 };
    }
    default:
      return { hw: s / 2, hh: s / 2 };
  }
}

export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  type: ComponentType,
  center: Point,
  extraScale = 1,
): void {
  const s = BASE * extraScale;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.strokeStyle = '#1f2937';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.2, 1.2 * extraScale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (type) {
    case 'junction_box': {
      const pad = s * 0.12;
      ctx.fillRect(-s / 2 + pad, -s / 2 + pad, s - pad * 2, s - pad * 2);
      ctx.strokeRect(-s / 2 + pad, -s / 2 + pad, s - pad * 2, s - pad * 2);
      ctx.beginPath();
      ctx.moveTo(-s * 0.14, 0);
      ctx.lineTo(s * 0.14, 0);
      ctx.moveTo(0, -s * 0.14);
      ctx.lineTo(0, s * 0.14);
      ctx.stroke();
      break;
    }
    case 'outlet': {
      ctx.beginPath();
      ctx.arc(0, 0, s / 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s * 0.1, s * 0.08, 0, Math.PI, false);
      ctx.stroke();
      const slotW = s * 0.06;
      const slotH = s * 0.16;
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-s * 0.14, -s * 0.16, slotW, slotH);
      ctx.fillRect(s * 0.08, -s * 0.16, slotW, slotH);
      break;
    }
    case 'switch': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.14, 0);
      ctx.lineTo(s * 0.55, -s * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.55, -s * 0.45, s * 0.06, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'lamp': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.2);
      ctx.lineTo(s * 0.2, s * 0.2);
      ctx.moveTo(s * 0.2, -s * 0.2);
      ctx.lineTo(-s * 0.2, s * 0.2);
      ctx.stroke();
      break;
    }
    case 'panel': {
      const pw = s * 1.1;
      const ph = s * 0.85;
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      ctx.beginPath();
      ctx.moveTo(-pw / 2, -ph * 0.15);
      ctx.lineTo(pw / 2, -ph * 0.15);
      ctx.moveTo(-pw / 2, ph * 0.15);
      ctx.lineTo(pw / 2, ph * 0.15);
      ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * pw * 0.28, 0, s * 0.06, 0, Math.PI * 2);
        ctx.fillStyle = '#1f2937';
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}
