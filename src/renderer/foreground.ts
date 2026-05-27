import { Point, Connection } from '../core/types.ts';
import { Store } from '../core/store.ts';
import { getProfile } from '../core/profiles.ts';
import { drawSymbol, getSymbolHalfSize, getNodeScale } from './symbols.ts';
import { drawLabel, drawNodeLabel } from './labels.ts';
import { orthogonalize, getNodeBounds } from './path-engine.ts';

export class ForegroundRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId = 0;
  private scale = 1;
  private offset: Point = { x: 40, y: 40 };
  private dirty = true;
  private selectedNodeId: string | null = null;
  private selectedConnectionId: string | null = null;
  private selectedWaypointId: string | null = null;
  private connectionOriginId: string | null = null;
  private connectionVia: readonly string[] = [];
  private connectionPreviewPoint: Point | null = null;
  private masterMode = false;
  private selectedModuleId: string | null = null;
  private masterOriginId: string | null = null;
  private pathCache = new Map<string, Point[]>();

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  setMasterMode(enabled: boolean): void {
    this.masterMode = enabled;
    this.invalidate();
  }

  setSelectedModuleId(id: string | null): void {
    this.selectedModuleId = id;
    this.invalidate();
  }

  setMasterOriginId(id: string | null): void {
    this.masterOriginId = id;
    this.invalidate();
  }

  constructor(private readonly container: HTMLElement, private readonly store: Store) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.zIndex = '2';
    this.canvas.style.cursor = 'crosshair';
    this.ctx = this.canvas.getContext('2d')!;
    this.container.appendChild(this.canvas);
    this.resize();

    window.addEventListener('resize', () => {
      this.resize();
      this.invalidate();
    });

    this.startLoop();
  }

  setViewport(offset: Point, scale: number): void {
    this.offset = offset;
    this.scale = scale;
    this.invalidate();
  }

  setSelectedNodeId(id: string | null): void {
    this.selectedNodeId = id;
    this.invalidate();
  }

  setSelectedConnectionId(id: string | null): void {
    this.selectedConnectionId = id;
    this.invalidate();
  }

  setSelectedWaypointId(id: string | null): void {
    this.selectedWaypointId = id;
    this.invalidate();
  }

  setConnectionOriginId(id: string | null): void {
    this.connectionOriginId = id;
    this.invalidate();
  }

  setConnectionVia(via: readonly string[]): void {
    this.connectionVia = via;
    this.invalidate();
  }

  setConnectionPreviewPoint(point: Point | null): void {
    this.connectionPreviewPoint = point;
    this.invalidate();
  }

  invalidate(): void {
    this.dirty = true;
    this.pathCache.clear();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.invalidate();
  }

  private startLoop(): void {
    const loop = () => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private render(): void {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.save();
    this.ctx.translate(this.offset.x, this.offset.y);
    this.ctx.scale(this.scale, this.scale);

    if (this.masterMode) {
      this.drawModules();
    } else {
      this.drawConnections();
      this.drawPendingConnection();
      this.drawNodes();
    }

    this.ctx.restore();
  }

  private drawConnections(): void {
    const connections = this.store.getAllConnections();

    // Group connections by normalized endpoint pair to coordinate cable offsets
    const connectionGroups = new Map<string, Connection[]>();
    for (const conn of connections) {
      const key = this.normalizeConnectionKey(conn.from, conn.to, conn.via);
      const group = connectionGroups.get(key) || [];
      group.push(conn);
      connectionGroups.set(key, group);
    }

    for (const [_, group] of connectionGroups) {
      const firstConn = group[0];
      const path = this.getConnectionPath(firstConn);
      if (path.length < 2) continue;

      // Collect ALL conductors from ALL connections in this group
      const allConductors: { conductor: any; connectionId: string }[] = [];
      for (const conn of group) {
        const conductors = conn.conductorIds
          .map((cid) => this.store.getConductor(cid))
          .filter((c): c is NonNullable<typeof c> => c !== undefined);
        for (const c of conductors) {
          allConductors.push({ conductor: c, connectionId: conn.id });
        }
      }

      const count = allConductors.length;
      const spacing = Math.max(24, count * 5);
      const totalOffset = (count - 1) * spacing;

      let longestSegIndex = 0;
      let longestSegLen = 0;
      for (let s = 0; s < path.length - 1; s++) {
        const dx = path[s + 1].x - path[s].x;
        const dy = path[s + 1].y - path[s].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > longestSegLen) {
          longestSegLen = len;
          longestSegIndex = s;
        }
      }
      const labelSegFrom = path[longestSegIndex];
      const labelSegTo = path[longestSegIndex + 1];

      // Fixed diagonal offset direction: NE-SW diagonal normal (~0.707, 0.707)
      const diag = 0.70710678;

      for (let i = 0; i < count; i++) {
        const { conductor: c, connectionId } = allConductors[i];
        const profile = getProfile(c.profileId);
        const offset = (i * spacing) - (totalOffset / 2);
        const isSelected = connectionId === this.selectedConnectionId;

        const lineWidth = profile ? Math.max(1.6, profile.width) : 1.6;

        const offsetPath = path.map((pt) => ({
          x: pt.x + diag * offset,
          y: pt.y + diag * offset,
        }));

        const drawCablePath = (): void => {
          this.ctx.moveTo(offsetPath[0].x, offsetPath[0].y);
          for (let s = 1; s < offsetPath.length; s++) {
            this.ctx.lineTo(offsetPath[s].x, offsetPath[s].y);
          }
        };

        // Functional glow based on wire function
        const funcGlow: Record<string, string> = {
          fase: 'rgba(239,68,68,0.15)',
          neutro: 'rgba(59,130,246,0.15)',
          tierra: 'rgba(34,197,94,0.15)',
          retorno: 'rgba(234,179,8,0.15)',
        };
        const glowColor = funcGlow[profile?.function || ''] || 'rgba(15,23,42,0.08)';
        this.ctx.strokeStyle = glowColor;
        this.ctx.lineWidth = lineWidth + 5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();
        drawCablePath();
        this.ctx.stroke();

        // Dark outline for contrast
        this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.30)';
        this.ctx.lineWidth = lineWidth + 2.5;
        this.ctx.beginPath();
        drawCablePath();
        this.ctx.stroke();

        // Real cable color
        this.ctx.strokeStyle = profile ? profile.color : '#9ca3af';
        this.ctx.lineWidth = lineWidth;
        if (isSelected) {
          this.ctx.lineWidth += 1.5;
          this.ctx.shadowColor = profile ? profile.color : '#3b82f6';
          this.ctx.shadowBlur = 8;
        } else {
          this.ctx.shadowColor = 'transparent';
          this.ctx.shadowBlur = 0;
        }
        this.ctx.beginPath();
        drawCablePath();
        this.ctx.stroke();
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;

        const labelT = count > 1 ? 0.25 + (i / (count - 1)) * 0.5 : 0.5;
        const labelPos = {
          x: labelSegFrom.x + (labelSegTo.x - labelSegFrom.x) * labelT + diag * offset * 0.6,
          y: labelSegFrom.y + (labelSegTo.y - labelSegFrom.y) * labelT + diag * offset * 0.6,
        };
        drawLabel(this.ctx, c.wireLabel, labelPos, 1 / this.scale);
      }

      // Draw waypoint handles for selected connections in this group
      for (const conn of group) {
        if (conn.id !== this.selectedConnectionId) continue;
        for (const viaId of conn.via) {
          const viaNode = this.store.getNode(viaId);
          if (!viaNode) continue;
          const isWaypointSelected = viaId === this.selectedWaypointId;
          this.ctx.beginPath();
          this.ctx.arc(viaNode.position.x, viaNode.position.y, isWaypointSelected ? 6 : 4, 0, Math.PI * 2);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fill();
          this.ctx.strokeStyle = isWaypointSelected ? '#f59e0b' : '#3b82f6';
          this.ctx.lineWidth = isWaypointSelected ? 2.5 : 1.5;
          this.ctx.stroke();
        }
      }
    }
  }

  private drawPendingConnection(): void {
    if (!this.connectionOriginId) return;
    const originNode = this.store.getNode(this.connectionOriginId);
    if (!originNode) return;

    const basePath: Point[] = [originNode.position];
    for (const viaId of this.connectionVia) {
      const viaNode = this.store.getNode(viaId);
      if (viaNode) basePath.push(viaNode.position);
    }
    if (this.connectionPreviewPoint) {
      basePath.push(this.connectionPreviewPoint);
    }

    const obstacles = this.store
      .getAllNodes()
      .filter((n) => n.id !== this.connectionOriginId && !this.connectionVia.includes(n.id))
      .map((n) => getNodeBounds(n));
    const path = orthogonalize(basePath, obstacles);

    this.ctx.strokeStyle = '#f59e0b';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([5, 4]);
    this.ctx.beginPath();
    for (let i = 0; i < path.length - 1; i++) {
      this.ctx.moveTo(path[i].x, path[i].y);
      this.ctx.lineTo(path[i + 1].x, path[i + 1].y);
    }
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    for (const viaId of this.connectionVia) {
      const viaNode = this.store.getNode(viaId);
      if (!viaNode) continue;
      const viaScale = this.getNodeExtraScale(viaNode.id);
      const viaSize = getSymbolHalfSize(viaNode.type, viaScale);
      const viaR = Math.max(viaSize.hw, viaSize.hh) + 8;
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 3]);
      this.ctx.beginPath();
      this.ctx.arc(viaNode.position.x, viaNode.position.y, viaR, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    const originScale = this.getNodeExtraScale(originNode.id);
    const originSize = getSymbolHalfSize(originNode.type, originScale);
    const originR = Math.max(originSize.hw, originSize.hh) + 10;
    this.ctx.strokeStyle = '#f59e0b';
    this.ctx.lineWidth = 2.5;
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    this.ctx.arc(originNode.position.x, originNode.position.y, originR, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  private getNodeExtraScale(nodeId: string): number {
    const conns = this.store.getAllConnections();
    const count = conns.filter(
      (c) => c.from === nodeId || c.to === nodeId || c.via.includes(nodeId),
    ).length;
    return getNodeScale(count);
  }

  private drawNodes(): void {
    const nodes = this.store.getAllNodes();
    for (const node of nodes) {
      const isSelected = node.id === this.selectedNodeId;
      const isVia = this.connectionVia.includes(node.id);
      const isOrigin = node.id === this.connectionOriginId;
      const extraScale = this.getNodeExtraScale(node.id);

      if (isSelected || isOrigin || isVia) {
        if (isOrigin || isVia) {
          this.ctx.fillStyle = 'rgba(245,158,11,0.12)';
          this.ctx.strokeStyle = '#f59e0b';
        } else {
          this.ctx.fillStyle = 'rgba(59,130,246,0.12)';
          this.ctx.strokeStyle = '#3b82f6';
        }
        const { hw, hh } = getSymbolHalfSize(node.type, extraScale);
        const haloR = Math.max(hw, hh) + 10;
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        this.ctx.arc(node.position.x, node.position.y, haloR, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      }

      drawSymbol(this.ctx, node.type, node.position, extraScale);

      if (node.label) {
        drawNodeLabel(this.ctx, node.label, node.position, 1);
      }
    }
  }

  private drawModules(): void {
    const modules = this.store.getAllModules();
    const links = this.store.getModuleLinks();

    // Draw links between modules first
    for (const link of links) {
      const fromMod = modules.find((m) => m.id === link.fromModuleId);
      const toMod = modules.find((m) => m.id === link.toModuleId);
      if (!fromMod || !toMod) continue;
      const fx = fromMod.position.x + fromMod.size.width / 2;
      const fy = fromMod.position.y + fromMod.size.height / 2;
      const tx = toMod.position.x + toMod.size.width / 2;
      const ty = toMod.position.y + toMod.size.height / 2;
      this.ctx.strokeStyle = '#94a3b8';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([6, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(fx, fy);
      this.ctx.lineTo(tx, ty);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      for (let i = 0; i < link.conductorIds.length; i++) {
        const cond = this.store.getModuleConductors(link.fromModuleId).find((c) => c.id === link.conductorIds[i]);
        if (!cond) continue;
        const profile = getProfile(cond.profileId);
        const t = link.conductorIds.length > 1 ? 0.3 + (i / (link.conductorIds.length - 1)) * 0.4 : 0.5;
        const lx = fx + (tx - fx) * t;
        const ly = fy + (ty - fy) * t;
        const offset = (i - (link.conductorIds.length - 1) / 2) * 4;
        this.ctx.fillStyle = profile ? profile.color : '#94a3b8';
        this.ctx.beginPath();
        this.ctx.arc(lx + offset, ly + offset, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    for (const mod of modules) {
      const isSelected = mod.id === this.selectedModuleId;
      const isOrigin = mod.id === this.masterOriginId;
      const x = mod.position.x;
      const y = mod.position.y;
      const w = mod.size.width;
      const h = mod.size.height;

      if (isOrigin) {
        this.ctx.fillStyle = 'rgba(245,158,11,0.12)';
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = 2.5;
      } else if (isSelected) {
        this.ctx.fillStyle = 'rgba(59,130,246,0.08)';
        this.ctx.strokeStyle = '#3b82f6';
        this.ctx.lineWidth = 2;
      } else {
        this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this.ctx.strokeStyle = '#cbd5e1';
        this.ctx.lineWidth = 1.5;
      }
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, w, h, 8);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#0f172a';
      this.ctx.font = `bold ${13 * this.scale}px 'Segoe UI', sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(mod.name, x + w / 2, y + 10);

      // Snap anchors
      for (const anchor of mod.snapAnchors) {
        const ax = x + anchor.position.x;
        const ay = y + anchor.position.y;
        this.ctx.beginPath();
        this.ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = anchor.direction === 'input' ? '#3b82f6' : '#22c55e';
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    }
  }

  private normalizeConnectionKey(from: string, to: string, via: readonly string[]): string {
    // Normalize by sorting endpoints alphabetically so A→B and B→A use the same cache key
    const endpoints = [from, to].sort();
    const viaKey = via.join(',');
    return `${endpoints[0]}|${endpoints[1]}|${viaKey}`;
  }

  private getConnectionPath(conn: { from: string; to: string; via: readonly string[] }): Point[] {
    const cacheKey = this.normalizeConnectionKey(conn.from, conn.to, conn.via);
    const cached = this.pathCache.get(cacheKey);
    if (cached) return cached;

    const basePath: Point[] = [];
    const fromNode = this.store.getNode(conn.from);
    if (fromNode) basePath.push(fromNode.position);
    for (const viaId of conn.via) {
      const viaNode = this.store.getNode(viaId);
      if (viaNode) basePath.push(viaNode.position);
    }
    const toNode = this.store.getNode(conn.to);
    if (toNode) basePath.push(toNode.position);

    const obstacles = this.store
      .getAllNodes()
      .filter((n) => n.id !== conn.from && n.id !== conn.to && !conn.via.includes(n.id))
      .map((n) => getNodeBounds(n));

    const path = orthogonalize(basePath, obstacles);
    this.pathCache.set(cacheKey, path);
    return path;
  }

  getRenderedPath(conn: Connection): Point[] {
    return this.getConnectionPath(conn);
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.canvas.remove();
  }
}
