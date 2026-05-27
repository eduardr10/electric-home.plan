import { getProfile, getAllProfiles } from '../core/profiles.ts';
import { Connection, Node, Point, Conductor } from '../core/types.ts';

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function pathLength(path: Point[]): number {
  let len = 0;
  for (let i = 0; i < path.length - 1; i++) {
    len += distance(path[i], path[i + 1]);
  }
  return len;
}

export function exportSVG(nodes: readonly Node[], connections: readonly Connection[], conductors: readonly Conductor[]): { svg: string; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x - 40);
    minY = Math.min(minY, node.position.y - 40);
    maxX = Math.max(maxX, node.position.x + 40);
    maxY = Math.max(maxY, node.position.y + 40);
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  const padding = 80;
  const legendHeight = 120;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2 + legendHeight;
  const viewX = minX - padding;
  const viewY = minY - padding;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewX} ${viewY} ${w} ${h}">\n`;
  svg += `  <rect x="${viewX}" y="${viewY}" width="${w}" height="${h}" fill="#ffffff"/>\n`;

  const conductorMap = new Map(conductors.map((c) => [c.id, c]));
  const usageMap = new Map<string, number>();

  for (const conn of connections) {
    const path: Point[] = [];
    const from = nodes.find((n) => n.id === conn.from);
    const to = nodes.find((n) => n.id === conn.to);
    if (!from || !to) continue;
    path.push(from.position);
    for (const viaId of conn.via) {
      const via = nodes.find((n) => n.id === viaId);
      if (via) path.push(via.position);
    }
    path.push(to.position);

    const len = pathLength(path);
    const count = conn.conductorIds.length;
    const spacing = 3.5;
    const totalOffset = (count - 1) * spacing;

    for (let i = 0; i < count; i++) {
      const cid = conn.conductorIds[i];
      const c = conductorMap.get(cid);
      if (!c) continue;
      const profile = getProfile(c.profileId);
      const color = profile ? profile.color : '#9ca3af';
      const strokeWidth = profile ? Math.max(1.2, profile.width * 0.8) : 1.5;
      const offset = (i * spacing) - (totalOffset / 2);

      let d = '';
      for (let s = 0; s < path.length - 1; s++) {
        const fromPt = path[s];
        const toPt = path[s + 1];
        const dx = toPt.x - fromPt.x;
        const dy = toPt.y - fromPt.y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        const perpX = segLen > 0 ? (-dy / segLen) * offset : 0;
        const perpY = segLen > 0 ? (dx / segLen) * offset : 0;

        if (s === 0) {
          d += `M${fromPt.x + perpX},${fromPt.y + perpY} `;
        }
        d += `L${toPt.x + perpX},${toPt.y + perpY} `;
      }

      svg += `  <path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>\n`;

      const midIdx = Math.floor(path.length / 2);
      const midX = path[midIdx].x;
      const midY = path[midIdx].y;
      svg += `  <text x="${midX + 6}" y="${midY + 3}" font-size="10" fill="#374151" font-family="'Segoe UI', Roboto, sans-serif">${c.wireLabel}</text>\n`;

      usageMap.set(c.profileId, (usageMap.get(c.profileId) || 0) + len);
    }
  }

  for (const node of nodes) {
    svg += drawNodeSVG(node);
  }

  svg += drawLegendSVG(viewX + padding / 2, maxY + padding / 2, usageMap);
  svg += '</svg>';
  return { svg, width: w, height: h };
}

function drawNodeSVG(node: Node): string {
  const { x, y } = node.position;
  const s = 20;
  let shape = '';

  switch (node.type) {
    case 'junction_box':
      shape = `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="2" fill="#ffffff" stroke="#1f2937" stroke-width="1.5"/><line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}" stroke="#1f2937" stroke-width="1.5"/><line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 3}" stroke="#1f2937" stroke-width="1.5"/>`;
      break;
    case 'outlet':
      shape = `<circle cx="${x}" cy="${y}" r="${s / 2.2}" fill="#ffffff" stroke="#1f2937" stroke-width="1.5"/><path d="M${x},${y + 2} A${s * 0.08},${s * 0.08} 0 0,1 ${x},${y + 8}" fill="none" stroke="#1f2937" stroke-width="1.5"/><rect x="${x - s * 0.14}" y="${y - s * 0.16}" width="${s * 0.06}" height="${s * 0.16}" fill="#1f2937"/><rect x="${x + s * 0.08}" y="${y - s * 0.16}" width="${s * 0.06}" height="${s * 0.16}" fill="#1f2937"/>`;
      break;
    case 'switch':
      shape = `<circle cx="${x}" cy="${y}" r="${s * 0.14}" fill="#ffffff" stroke="#1f2937" stroke-width="1.5"/><line x1="${x + s * 0.14}" y1="${y}" x2="${x + s * 0.55}" y2="${y - s * 0.45}" stroke="#1f2937" stroke-width="1.5"/><circle cx="${x + s * 0.55}" cy="${y - s * 0.45}" r="${s * 0.06}" fill="none" stroke="#1f2937" stroke-width="1.5"/>`;
      break;
    case 'lamp':
      shape = `<circle cx="${x}" cy="${y}" r="${s * 0.32}" fill="#ffffff" stroke="#1f2937" stroke-width="1.5"/><line x1="${x - s * 0.2}" y1="${y - s * 0.2}" x2="${x + s * 0.2}" y2="${y + s * 0.2}" stroke="#1f2937" stroke-width="1.5"/><line x1="${x + s * 0.2}" y1="${y - s * 0.2}" x2="${x - s * 0.2}" y2="${y + s * 0.2}" stroke="#1f2937" stroke-width="1.5"/>`;
      break;
  }

  let labelText = '';
  if (node.label) {
    labelText = `<text x="${x}" y="${y + s + 10}" font-size="9" fill="#0f172a" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="bold">${node.label}</text>`;
  }

  return `  ${shape}\n${labelText ? `  ${labelText}\n` : ''}`;
}

function drawLegendSVG(x: number, y: number, usageMap: Map<string, number>): string {
  const allProfiles = getAllProfiles();
  const usedProfiles = allProfiles.filter((p) => (usageMap.get(p.id) || 0) > 0);

  if (usedProfiles.length === 0) return '';

  let legend = '';
  const rowH = 22;
  const boxW = 200;
  const boxH = usedProfiles.length * rowH + 32;

  legend += `  <rect x="${x - 8}" y="${y - 8}" width="${boxW}" height="${boxH}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" rx="4"/>\n`;
  legend += `  <text x="${x}" y="${y + 10}" font-size="11" fill="#374151" font-weight="600" font-family="'Segoe UI', Roboto, sans-serif">Cable Legend</text>\n`;

  for (let i = 0; i < usedProfiles.length; i++) {
    const p = usedProfiles[i];
    const ly = y + 28 + i * rowH;
    const meters = Math.round((usageMap.get(p.id) || 0) / 100) / 10;
    legend += `  <rect x="${x}" y="${ly - 6}" width="14" height="8" rx="2" fill="${p.color}" stroke="#1f2937" stroke-width="0.5"/>\n`;
    legend += `  <text x="${x + 20}" y="${ly}" font-size="10" fill="#374151" font-family="'Segoe UI', Roboto, sans-serif">${p.label} - ${p.function} - ~${meters} m</text>\n`;
  }

  return legend;
}

export function downloadSVG(svgContent: string, filename = 'electric-plan.svg'): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
