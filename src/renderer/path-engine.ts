import { Point, Node } from '../core/types.ts';
import { getSymbolHalfSize } from './symbols.ts';

const MARGIN = 16;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getNodeBounds(node: Node, margin = MARGIN): Rect {
  const { hw, hh } = getSymbolHalfSize(node.type);
  return {
    x: node.position.x - hw - margin,
    y: node.position.y - hh - margin,
    w: (hw + margin) * 2,
    h: (hh + margin) * 2,
  };
}

function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  if (a.y === b.y) {
    const y = a.y;
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    return y >= rect.y && y <= rect.y + rect.h && xMax >= rect.x && xMin <= rect.x + rect.w;
  }
  if (a.x === b.x) {
    const x = a.x;
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    return x >= rect.x && x <= rect.x + rect.w && yMax >= rect.y && yMin <= rect.y + rect.h;
  }
  return false;
}

function countCollisions(path: Point[], obstacles: Rect[]): number {
  let count = 0;
  for (let i = 0; i < path.length - 1; i++) {
    for (const rect of obstacles) {
      if (segmentIntersectsRect(path[i], path[i + 1], rect)) count++;
    }
  }
  return count;
}

function createBypass(a: Point, b: Point, obstacles: Rect[], depth: number): Point[] {
  if (depth > 2) return [a, b];

  const colliding = obstacles.find((r) => segmentIntersectsRect(a, b, r));
  if (!colliding) return [a, b];

  if (a.y === b.y) {
    const xStart = Math.min(a.x, b.x);
    const xEnd = Math.max(a.x, b.x);
    const y = a.y;
    const above = colliding.y - MARGIN;
    const below = colliding.y + colliding.h + MARGIN;
    const detourY = Math.abs(y - above) <= Math.abs(y - below) ? above : below;
    return [
      { x: xStart, y },
      { x: xStart, y: detourY },
      { x: xEnd, y: detourY },
      { x: xEnd, y },
    ];
  }

  if (a.x === b.x) {
    const yStart = Math.min(a.y, b.y);
    const yEnd = Math.max(a.y, b.y);
    const x = a.x;
    const left = colliding.x - MARGIN;
    const right = colliding.x + colliding.w + MARGIN;
    const detourX = Math.abs(x - left) <= Math.abs(x - right) ? left : right;
    return [
      { x, y: yStart },
      { x: detourX, y: yStart },
      { x: detourX, y: yEnd },
      { x, y: yEnd },
    ];
  }

  return [a, b];
}

function routeSegment(a: Point, b: Point, obstacles: Rect[], depth: number): Point[] {
  if (depth > 2) return [a, b];

  if (a.x === b.x || a.y === b.y) {
    let collides = false;
    for (const r of obstacles) {
      if (segmentIntersectsRect(a, b, r)) {
        collides = true;
        break;
      }
    }
    if (!collides) return [a, b];
    return createBypass(a, b, obstacles, depth);
  }

  const c1: Point = { x: b.x, y: a.y };
  const c2: Point = { x: a.x, y: b.y };
  const path1 = [a, c1, b];
  const path2 = [a, c2, b];

  const col1 = countCollisions(path1, obstacles);
  const col2 = countCollisions(path2, obstacles);

  let best: Point[];
  if (col1 === 0) best = path1;
  else if (col2 === 0) best = path2;
  else best = col1 <= col2 ? path1 : path2;

  const result: Point[] = [best[0]];
  for (let i = 0; i < best.length - 1; i++) {
    const segA = best[i];
    const segB = best[i + 1];
    let collides = false;
    for (const r of obstacles) {
      if (segmentIntersectsRect(segA, segB, r)) {
        collides = true;
        break;
      }
    }
    if (collides) {
      const bypass = createBypass(segA, segB, obstacles, depth + 1);
      result.push(...bypass.slice(1));
    } else {
      result.push(segB);
    }
  }

  return result;
}

export function orthogonalize(points: Point[], obstacles: Rect[]): Point[] {
  if (points.length < 2) return [...points];
  // Sort obstacles deterministically by position to ensure consistent routing
  const sortedObstacles = [...obstacles].sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    if (a.w !== b.w) return a.w - b.w;
    return a.h - b.h;
  });
  const result: Point[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const segment = routeSegment(result[result.length - 1], points[i + 1], sortedObstacles, 0);
    result.push(...segment.slice(1));
  }
  return result;
}

export function pointToPathDistance(pos: Point, path: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (a.x === b.x) {
      const x = a.x;
      const yMin = Math.min(a.y, b.y);
      const yMax = Math.max(a.y, b.y);
      if (pos.y >= yMin && pos.y <= yMax) {
        best = Math.min(best, Math.abs(pos.x - x));
      } else {
        const dy = Math.min(Math.abs(pos.y - yMin), Math.abs(pos.y - yMax));
        best = Math.min(best, Math.sqrt((pos.x - x) ** 2 + dy ** 2));
      }
    } else if (a.y === b.y) {
      const y = a.y;
      const xMin = Math.min(a.x, b.x);
      const xMax = Math.max(a.x, b.x);
      if (pos.x >= xMin && pos.x <= xMax) {
        best = Math.min(best, Math.abs(pos.y - y));
      } else {
        const dx = Math.min(Math.abs(pos.x - xMin), Math.abs(pos.x - xMax));
        best = Math.min(best, Math.sqrt(dx ** 2 + (pos.y - y) ** 2));
      }
    } else {
      const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (l2 === 0) {
        best = Math.min(best, Math.sqrt((pos.x - a.x) ** 2 + (pos.y - a.y) ** 2));
        continue;
      }
      let t = ((pos.x - a.x) * (b.x - a.x) + (pos.y - a.y) * (b.y - a.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const projX = a.x + t * (b.x - a.x);
      const projY = a.y + t * (b.y - a.y);
      best = Math.min(best, Math.sqrt((pos.x - projX) ** 2 + (pos.y - projY) ** 2));
    }
  }
  return best;
}

export function getPointAtFraction(path: Point[], t: number): Point {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return path[0];

  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = Math.sqrt((path[i + 1].x - path[i].x) ** 2 + (path[i + 1].y - path[i].y) ** 2);
    lengths.push(len);
    total += len;
  }

  if (total === 0) return path[0];

  const target = t * total;
  let accum = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (accum + lengths[i] >= target) {
      const localT = lengths[i] === 0 ? 0 : (target - accum) / lengths[i];
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * localT,
        y: path[i].y + (path[i + 1].y - path[i].y) * localT,
      };
    }
    accum += lengths[i];
  }
  return path[path.length - 1];
}

export function findLongestSegmentIndex(path: Point[]): number {
  let bestIdx = 0;
  let bestLen = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = Math.sqrt((path[i + 1].x - path[i].x) ** 2 + (path[i + 1].y - path[i].y) ** 2);
    if (len > bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  return bestIdx;
}
