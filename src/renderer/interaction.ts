import { Store } from '../core/store.ts';
import { ComponentType, Node as ProjectNode, Point, Connection } from '../core/types.ts';
import { ForegroundRenderer } from './foreground.ts';
import { EventBus } from '../events.ts';
import { Inspector } from '../ui/inspector.ts';
import { ToolType } from '../ui/toolbar.ts';
import { getAllProfiles, getProfile } from '../core/profiles.ts';
import { pointToPathDistance } from './path-engine.ts';
import { getSymbolHalfSize, getNodeScale } from './symbols.ts';

interface DragState {
  type: 'node' | 'pan' | 'module';
  startX: number;
  startY: number;
  nodeId?: string;
  moduleId?: string;
  originalPosition?: Point;
}

export class CanvasController {
  private canvas: HTMLCanvasElement;
  private isDragging = false;
  private dragState: DragState | null = null;
  private currentTool: ToolType = 'select';
  private offset: Point = { x: 40, y: 40 };
  private scale = 1;
  private selectedNodeId: string | null = null;
  private selectedConnectionId: string | null = null;
  private selectedWaypointId: string | null = null;
  private connectionOriginId: string | null = null;
  private connectionVia: string[] = [];
  private masterModuleOriginId: string | null = null;
  private masterClickStart: { modId: string; x: number; y: number } | null = null;
  private lastClickTime = 0;
  private lastClickNodeId: string | null = null;

  constructor(
    private readonly store: Store,
    private readonly foreground: ForegroundRenderer,
    private readonly inspector: Inspector,
    private readonly events: EventBus
  ) {
    this.canvas = foreground.getCanvas();
    this.bindEvents();

    events.on('inspector:editConnection', (payload) => {
      const connId = payload as string;
      const conn = this.store.getConnection(connId);
      if (!conn) return;
      this.selectedConnectionId = connId;
      this.foreground.setSelectedConnectionId(connId);
      this.foreground.setSelectedNodeId(null);
      this.inspector.selectConnection(connId);
      this.showCableSelector(conn.from, conn.to, conn.via, conn.conductorIds);
    });
  }

  setTool(tool: ToolType): void {
    this.currentTool = tool;
    this.clearSelection();
    this.foreground.setMasterMode(tool === 'master');
    this.canvas.style.cursor = tool === 'select' || tool === 'master' ? 'default' : 'crosshair';
  }

  clearSelection(): void {
    this.selectedNodeId = null;
    this.selectedConnectionId = null;
    this.selectedWaypointId = null;
    this.connectionOriginId = null;
    this.connectionVia = [];
    this.masterModuleOriginId = null;
    this.foreground.setSelectedNodeId(null);
    this.foreground.setSelectedConnectionId(null);
    this.foreground.setSelectedWaypointId(null);
    this.foreground.setSelectedModuleId(null);
    this.foreground.setMasterOriginId(null);
    this.foreground.setConnectionOriginId(null);
    this.foreground.setConnectionVia([]);
    this.foreground.setConnectionPreviewPoint(null);
    this.inspector.selectNode(null);
    this.inspector.selectConnection(null);
    this.events.emit('canvas:connectionSelected', null);
    this.removeInlineEditor();
    this.removeCableSelector();
  }

  private removeInlineEditor(): void {
    const existing = document.querySelector('.inline-label-editor');
    if (existing) existing.remove();
  }

  private removeCableSelector(): void {
    const existing = document.querySelector('.cable-selector-overlay');
    if (existing) existing.remove();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.canvas.setAttribute('tabindex', '0');

    document.addEventListener('click', (e) => {
      const editor = document.querySelector('.inline-label-editor');
      if (editor && !editor.contains(e.target as Element)) {
        this.removeInlineEditor();
      }
    });
  }

  private getMousePosition(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offset.x) / this.scale,
      y: (e.clientY - rect.top - this.offset.y) / this.scale,
    };
  }

  private findNodeAt(pos: Point): ProjectNode | undefined {
    const nodes = this.store.getAllNodes();
    const conns = this.store.getAllConnections();
    for (const node of nodes) {
      const connCount = conns.filter(
        (c) => c.from === node.id || c.to === node.id || c.via.includes(node.id),
      ).length;
      const extraScale = getNodeScale(connCount);
      const { hw, hh } = getSymbolHalfSize(node.type, extraScale);
      const pad = 6;
      if (
        pos.x >= node.position.x - hw - pad &&
        pos.x <= node.position.x + hw + pad &&
        pos.y >= node.position.y - hh - pad &&
        pos.y <= node.position.y + hh + pad
      ) {
        return node;
      }
    }
    return undefined;
  }

  private findModuleAt(pos: Point): { id: string; position: Point; size: { width: number; height: number } } | undefined {
    const modules = this.store.getAllModules();
    for (const mod of modules) {
      const x = mod.position.x;
      const y = mod.position.y;
      if (pos.x >= x && pos.x <= x + mod.size.width && pos.y >= y && pos.y <= y + mod.size.height) {
        return { id: mod.id, position: mod.position, size: mod.size };
      }
    }
    return undefined;
  }

  private findConnectionAt(pos: Point): Connection | undefined {
    const connections = this.store.getAllConnections();
    for (const conn of connections) {
      const path = this.foreground.getRenderedPath(conn);
      if (path.length < 2) continue;
      const count = conn.conductorIds.length;
      const spacing = Math.max(14, count * 3);
      const maxOffset = ((count - 1) * spacing) / 2;
      const threshold = (maxOffset + 14) / this.scale;
      const dist = pointToPathDistance(pos, path);
      if (dist < threshold) {
        return conn;
      }
    }
    return undefined;
  }



  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this.canvas.focus();
    this.removeInlineEditor();

    const pos = this.getMousePosition(e);

    if (this.currentTool !== 'select' && this.currentTool !== 'connect' && this.currentTool !== 'master') {
      const node = this.store.addNode(this.currentTool as ComponentType, pos);
      this.foreground.invalidate();
      this.selectNode(node.id);
      return;
    }

    if (this.currentTool === 'master') {
      const mod = this.findModuleAt(pos);
      if (mod) {
        this.masterClickStart = { modId: mod.id, x: e.clientX, y: e.clientY };
        this.isDragging = true;
        this.dragState = {
          type: 'module',
          startX: e.clientX,
          startY: e.clientY,
          moduleId: mod.id,
          originalPosition: mod.position,
        };
      } else {
        this.isDragging = true;
        this.dragState = {
          type: 'pan',
          startX: e.clientX,
          startY: e.clientY,
        };
        this.masterClickStart = null;
        this.masterModuleOriginId = null;
        this.foreground.setMasterOriginId(null);
        this.foreground.setSelectedModuleId(null);
      }
      return;
    }

    const node = this.findNodeAt(pos);

    if (this.currentTool === 'connect') {
      if (node) {
        if (!this.connectionOriginId) {
          this.connectionOriginId = node.id;
          this.foreground.setConnectionOriginId(node.id);
          this.foreground.setConnectionVia([]);
        } else {
          if (node.id === this.connectionOriginId || this.connectionVia.includes(node.id)) {
            return;
          }
          this.connectionVia.push(node.id);
          this.foreground.setConnectionVia([...this.connectionVia]);
        }
      } else {
        if (!this.connectionOriginId) {
          this.clearSelection();
        }
      }
      return;
    }

    if (node) {
      if (this.selectedConnectionId) {
        const conn = this.store.getConnection(this.selectedConnectionId);
        if (conn && conn.via.includes(node.id)) {
          this.selectWaypoint(node.id);
          return;
        }
      }

      const now = Date.now();
      const isDoubleClick = now - this.lastClickTime < 300 && this.lastClickNodeId === node.id;
      this.lastClickTime = now;
      this.lastClickNodeId = node.id;

      if (isDoubleClick) {
        this.isDragging = false;
        this.dragState = null;
        this.startInlineEdit(node);
        return;
      }

      this.isDragging = true;
      this.dragState = {
        type: 'node',
        startX: e.clientX,
        startY: e.clientY,
        nodeId: node.id,
        originalPosition: node.position,
      };
      this.selectNode(node.id);
      return;
    }

    this.lastClickTime = 0;
    this.lastClickNodeId = null;

    const conn = this.findConnectionAt(pos);
    if (conn) {
      this.selectConnection(conn.id);
      return;
    }

    this.isDragging = true;
    this.dragState = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
    };
    this.clearSelection();
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.currentTool === 'connect' && this.connectionOriginId) {
      const pos = this.getMousePosition(e);
      this.foreground.setConnectionPreviewPoint(pos);
    }

    if (this.masterClickStart) {
      const dx = e.clientX - this.masterClickStart.x;
      const dy = e.clientY - this.masterClickStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 3) {
        this.masterClickStart = null;
      }
    }

    if (!this.isDragging || !this.dragState) return;
    e.preventDefault();

    if (this.dragState.type === 'node' && this.dragState.nodeId && this.dragState.originalPosition) {
      const dx = (e.clientX - this.dragState.startX) / this.scale;
      const dy = (e.clientY - this.dragState.startY) / this.scale;
      this.store.updateNodePosition(this.dragState.nodeId, {
        x: this.dragState.originalPosition.x + dx,
        y: this.dragState.originalPosition.y + dy,
      });
      this.foreground.invalidate();
    } else if (this.dragState.type === 'module' && this.dragState.moduleId && this.dragState.originalPosition) {
      const dx = (e.clientX - this.dragState.startX) / this.scale;
      const dy = (e.clientY - this.dragState.startY) / this.scale;
      this.store.updateModulePosition(this.dragState.moduleId, {
        x: this.dragState.originalPosition.x + dx,
        y: this.dragState.originalPosition.y + dy,
      });
      this.foreground.invalidate();
    } else if (this.dragState.type === 'pan') {
      const dx = e.clientX - this.dragState.startX;
      const dy = e.clientY - this.dragState.startY;
      this.offset = { x: this.offset.x + dx, y: this.offset.y + dy };
      this.foreground.setViewport(this.offset, this.scale);
      this.dragState.startX = e.clientX;
      this.dragState.startY = e.clientY;
    }
  }

  private onMouseUp(): void {
    if (this.masterClickStart) {
      const modId = this.masterClickStart.modId;
      this.masterClickStart = null;
      if (this.currentTool === 'master') {
        if (!this.masterModuleOriginId) {
          this.masterModuleOriginId = modId;
          this.foreground.setMasterOriginId(modId);
        } else if (this.masterModuleOriginId === modId) {
          this.masterModuleOriginId = null;
          this.foreground.setMasterOriginId(null);
        } else {
          this.showModuleCableSelector(this.masterModuleOriginId, modId);
        }
      }
    }
    this.isDragging = false;
    this.dragState = null;
  }

  private onDoubleClick(e: MouseEvent): void {
    if (this.currentTool !== 'select') return;
    const pos = this.getMousePosition(e);
    const node = this.findNodeAt(pos);
    if (node) {
      this.startInlineEdit(node);
    }
  }

  private startInlineEdit(node: ProjectNode): void {
    this.removeInlineEditor();

    const rect = this.canvas.getBoundingClientRect();
    const screenPos = {
      x: rect.left + (node.position.x * this.scale) + this.offset.x,
      y: rect.top + (node.position.y * this.scale) + this.offset.y + 35,
    };

    const input = document.createElement('input');
    input.type = 'text';
    input.value = node.label;
    input.className = 'inline-label-editor';
    input.style.position = 'fixed';
    input.style.left = `${screenPos.x}px`;
    input.style.top = `${screenPos.y}px`;
    input.style.transform = 'translate(-50%, 0)';
    input.style.zIndex = '1000';
    input.style.fontSize = '12px';
    input.style.padding = '4px 8px';
    input.style.border = '1.5px solid #0f172a';
    input.style.borderRadius = '4px';
    input.style.outline = 'none';
    input.style.fontFamily = 'inherit';
    input.style.background = '#fff';
    input.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    input.style.minWidth = '80px';
    input.style.textAlign = 'center';

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        this.store.updateNodeLabel(node.id, input.value);
        this.foreground.invalidate();
        this.removeInlineEditor();
      }
      if (ev.key === 'Escape') {
        this.removeInlineEditor();
      }
    });

    input.addEventListener('blur', () => {
      this.store.updateNodeLabel(node.id, input.value);
      this.foreground.invalidate();
      this.removeInlineEditor();
    });

    document.body.appendChild(input);
    input.focus();
    input.select();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - this.offset.x) / this.scale;
    const worldY = (mouseY - this.offset.y) / this.scale;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.2, Math.min(5, this.scale * zoomFactor));

    this.offset = {
      x: mouseX - worldX * newScale,
      y: mouseY - worldY * newScale,
    };
    this.scale = newScale;
    this.foreground.setViewport(this.offset, this.scale);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.currentTool === 'connect' && this.connectionOriginId) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.connectionVia.length > 0) {
          const dest = this.connectionVia[this.connectionVia.length - 1];
          const via = this.connectionVia.slice(0, -1);
          this.showCableSelector(this.connectionOriginId, dest, via, []);
          this.connectionOriginId = null;
          this.connectionVia = [];
          this.foreground.setConnectionOriginId(null);
          this.foreground.setConnectionVia([]);
          this.foreground.setConnectionPreviewPoint(null);
        }
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (this.connectionVia.length > 0) {
          this.connectionVia.pop();
          this.foreground.setConnectionVia([...this.connectionVia]);
        } else if (this.connectionOriginId) {
          this.connectionOriginId = null;
          this.foreground.setConnectionOriginId(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        this.clearSelection();
        this.foreground.invalidate();
        return;
      }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedWaypointId && this.selectedConnectionId) {
        this.store.removeWaypointFromConnection(this.selectedConnectionId, this.selectedWaypointId);
        this.selectedWaypointId = null;
        this.foreground.setSelectedWaypointId(null);
        this.foreground.invalidate();
      } else if (this.selectedConnectionId) {
        this.store.removeConnection(this.selectedConnectionId);
        this.selectedConnectionId = null;
        this.foreground.setSelectedConnectionId(null);
        this.inspector.selectConnection(null);
        this.events.emit('canvas:connectionSelected', null);
        this.foreground.invalidate();
      } else if (this.selectedNodeId) {
        this.store.removeNode(this.selectedNodeId);
        this.selectedNodeId = null;
        this.foreground.setSelectedNodeId(null);
        this.inspector.selectNode(null);
        this.foreground.invalidate();
      }
    }
    if (e.key === 'Escape') {
      this.clearSelection();
      this.foreground.invalidate();
    }
  }

  private selectNode(nodeId: string): void {
    this.selectedNodeId = nodeId;
    this.selectedConnectionId = null;
    this.foreground.setSelectedNodeId(nodeId);
    this.foreground.setSelectedConnectionId(null);
    this.inspector.selectNode(nodeId);
    this.inspector.selectConnection(null);
    this.events.emit('canvas:nodeSelected', nodeId);
    this.events.emit('canvas:connectionSelected', null);
  }

  private selectConnection(connId: string): void {
    this.selectedConnectionId = connId;
    this.selectedNodeId = null;
    this.selectedWaypointId = null;
    this.foreground.setSelectedConnectionId(connId);
    this.foreground.setSelectedNodeId(null);
    this.foreground.setSelectedWaypointId(null);
    this.inspector.selectNode(null);
    this.inspector.selectConnection(connId);
    this.events.emit('canvas:connectionSelected', connId);
    this.events.emit('canvas:nodeSelected', null);
  }

  private selectWaypoint(waypointId: string): void {
    this.selectedWaypointId = waypointId;
    this.selectedNodeId = null;
    this.foreground.setSelectedWaypointId(waypointId);
    this.foreground.setSelectedNodeId(null);
    this.inspector.selectNode(null);
    this.inspector.selectConnection(null);
    this.events.emit('canvas:connectionSelected', null);
    this.events.emit('canvas:nodeSelected', null);
  }

  private showCableSelector(from: string, to: string, via: readonly string[], currentConductorIds: readonly string[]): void {
    this.removeCableSelector();

    const existingConn = this.selectedConnectionId ? this.store.getConnection(this.selectedConnectionId) : null;
    const isEditing = !!existingConn;

    const allConductors = this.store.getAllConductors();
    const profiles = getAllProfiles();
    const existingCheckboxes: HTMLInputElement[] = [];

    // Find conductors that arrive at the origin node
    const arrivingIds = new Set<string>();
    for (const conn of this.store.getAllConnections()) {
      const path = [conn.from, ...conn.via, conn.to];
      if (path.includes(from)) {
        for (const cid of conn.conductorIds) {
          arrivingIds.add(cid);
        }
      }
    }

    const arrivingConductors = allConductors.filter((c) => arrivingIds.has(c.id));
    const otherConductors = allConductors.filter((c) => !arrivingIds.has(c.id));

    const overlay = document.createElement('div');
    overlay.className = 'cable-selector-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.35)';
    overlay.style.zIndex = '2000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const panel = document.createElement('div');
    panel.style.background = '#ffffff';
    panel.style.borderRadius = '10px';
    panel.style.padding = '24px';
    panel.style.minWidth = '380px';
    panel.style.maxWidth = '480px';
    panel.style.maxHeight = '80vh';
    panel.style.overflowY = 'auto';
    panel.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18)';

    const title = document.createElement('div');
    title.textContent = isEditing ? 'Edit cables' : 'Select cables for connection';
    title.style.fontSize = '14px';
    title.style.fontWeight = '700';
    title.style.color = '#0f172a';
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    const pathInfo = document.createElement('div');
    pathInfo.style.fontSize = '12px';
    pathInfo.style.color = '#64748b';
    pathInfo.style.marginBottom = '16px';
    const fromNode = this.store.getNode(from);
    const toNode = this.store.getNode(to);
    let pathText = `${fromNode?.label || from} -> ${toNode?.label || to}`;
    if (via.length > 0) {
      const viaLabels = via.map((id) => this.store.getNode(id)?.label || id).join(' -> ');
      pathText = `${fromNode?.label || from} -> ${viaLabels} -> ${toNode?.label || to}`;
    }
    pathInfo.textContent = pathText;
    panel.appendChild(pathInfo);

    // Extend cables arriving at origin
    if (arrivingConductors.length > 0 && !isEditing) {
      const arrivingHeader = document.createElement('div');
      arrivingHeader.textContent = 'Extend cables arriving at origin';
      arrivingHeader.style.fontSize = '12px';
      arrivingHeader.style.fontWeight = '600';
      arrivingHeader.style.color = '#0f172a';
      arrivingHeader.style.marginBottom = '8px';
      panel.appendChild(arrivingHeader);

      const arrivingList = document.createElement('div');
      arrivingList.style.display = 'flex';
      arrivingList.style.flexDirection = 'column';
      arrivingList.style.gap = '6px';
      arrivingList.style.marginBottom = '16px';

      for (const c of arrivingConductors) {
        const profile = getProfile(c.profileId);
        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.padding = '6px 8px';
        row.style.borderRadius = '6px';
        row.style.cursor = 'pointer';
        row.style.transition = 'background 0.15s';
        row.style.background = '#f0fdf4';
        row.addEventListener('mouseenter', () => { row.style.background = '#dcfce7'; });
        row.addEventListener('mouseleave', () => { row.style.background = '#f0fdf4'; });

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = c.id;
        cb.checked = true;
        cb.style.width = '16px';
        cb.style.height = '16px';
        cb.style.cursor = 'pointer';
        existingCheckboxes.push(cb);

        const dot = document.createElement('span');
        dot.style.width = '14px';
        dot.style.height = '14px';
        dot.style.borderRadius = '3px';
        dot.style.background = profile?.color || '#999';
        dot.style.border = '1.5px solid #e2e8f0';
        dot.style.flexShrink = '0';

        const text = document.createElement('span');
        text.textContent = `${c.wireLabel}: ${profile?.label || c.profileId} (${profile?.function || '?'})`;
        text.style.fontSize = '12px';
        text.style.color = '#334155';
        text.style.flex = '1';

        row.appendChild(cb);
        row.appendChild(dot);
        row.appendChild(text);
        arrivingList.appendChild(row);
      }

      panel.appendChild(arrivingList);
    }

    // Other existing cables
    if (otherConductors.length > 0) {
      const otherHeader = document.createElement('div');
      otherHeader.textContent = 'Other existing cables';
      otherHeader.style.fontSize = '12px';
      otherHeader.style.fontWeight = '600';
      otherHeader.style.color = '#334155';
      otherHeader.style.marginBottom = '8px';
      panel.appendChild(otherHeader);

      const otherList = document.createElement('div');
      otherList.style.display = 'flex';
      otherList.style.flexDirection = 'column';
      otherList.style.gap = '6px';
      otherList.style.marginBottom = '16px';

      for (const c of otherConductors) {
        const profile = getProfile(c.profileId);
        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.padding = '6px 8px';
        row.style.borderRadius = '6px';
        row.style.cursor = 'pointer';
        row.style.transition = 'background 0.15s';
        row.addEventListener('mouseenter', () => { row.style.background = '#f1f5f9'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = c.id;
        cb.checked = currentConductorIds.includes(c.id);
        cb.style.width = '16px';
        cb.style.height = '16px';
        cb.style.cursor = 'pointer';
        existingCheckboxes.push(cb);

        const dot = document.createElement('span');
        dot.style.width = '14px';
        dot.style.height = '14px';
        dot.style.borderRadius = '3px';
        dot.style.background = profile?.color || '#999';
        dot.style.border = '1.5px solid #e2e8f0';
        dot.style.flexShrink = '0';

        const text = document.createElement('span');
        text.textContent = `${c.wireLabel}: ${profile?.label || c.profileId} (${profile?.function || '?'})`;
        text.style.fontSize = '12px';
        text.style.color = '#334155';
        text.style.flex = '1';

        row.appendChild(cb);
        row.appendChild(dot);
        row.appendChild(text);
        otherList.appendChild(row);
      }

      panel.appendChild(otherList);
    }

    // New cables section
    const newHeader = document.createElement('div');
    newHeader.textContent = 'Create new cables';
    newHeader.style.fontSize = '12px';
    newHeader.style.fontWeight = '600';
    newHeader.style.color = '#334155';
    newHeader.style.marginBottom = '8px';
    panel.appendChild(newHeader);

    const newList = document.createElement('div');
    newList.style.display = 'flex';
    newList.style.flexDirection = 'column';
    newList.style.gap = '6px';
    newList.style.marginBottom = '16px';

    const profileCounters: { profileId: string; count: number; display: HTMLSpanElement }[] = [];

    for (const p of profiles) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.padding = '6px 8px';
      row.style.borderRadius = '6px';
      row.style.transition = 'background 0.15s';
      row.addEventListener('mouseenter', () => { row.style.background = '#f1f5f9'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

      const dot = document.createElement('span');
      dot.style.width = '14px';
      dot.style.height = '14px';
      dot.style.borderRadius = '3px';
      dot.style.background = p.color;
      if (p.color.toLowerCase() === '#f8fafc' || p.color.toLowerCase() === '#ffffff') {
        dot.style.border = '1.5px solid #cbd5e1';
      }
      dot.style.flexShrink = '0';

      const text = document.createElement('span');
      text.textContent = `${p.label} - ${p.function}`;
      text.style.fontSize = '12px';
      text.style.color = '#334155';
      text.style.flex = '1';

      const countWrap = document.createElement('div');
      countWrap.style.display = 'flex';
      countWrap.style.alignItems = 'center';
      countWrap.style.gap = '4px';

      const minusBtn = document.createElement('button');
      minusBtn.textContent = '−';
      minusBtn.style.width = '22px';
      minusBtn.style.height = '22px';
      minusBtn.style.border = '1px solid #cbd5e1';
      minusBtn.style.borderRadius = '4px';
      minusBtn.style.background = '#ffffff';
      minusBtn.style.color = '#475569';
      minusBtn.style.fontSize = '14px';
      minusBtn.style.lineHeight = '1';
      minusBtn.style.cursor = 'pointer';
      minusBtn.style.fontFamily = 'inherit';

      const countDisplay = document.createElement('span');
      countDisplay.textContent = '0';
      countDisplay.style.width = '20px';
      countDisplay.style.textAlign = 'center';
      countDisplay.style.fontSize = '12px';
      countDisplay.style.fontWeight = '600';
      countDisplay.style.color = '#334155';

      const plusBtn = document.createElement('button');
      plusBtn.textContent = '+';
      plusBtn.style.width = '22px';
      plusBtn.style.height = '22px';
      plusBtn.style.border = '1px solid #cbd5e1';
      plusBtn.style.borderRadius = '4px';
      plusBtn.style.background = '#ffffff';
      plusBtn.style.color = '#475569';
      plusBtn.style.fontSize = '14px';
      plusBtn.style.lineHeight = '1';
      plusBtn.style.cursor = 'pointer';
      plusBtn.style.fontFamily = 'inherit';

      const counter = { profileId: p.id, count: 0, display: countDisplay };
      profileCounters.push(counter);

      minusBtn.addEventListener('click', () => {
        if (counter.count > 0) {
          counter.count--;
          counter.display.textContent = String(counter.count);
        }
      });
      plusBtn.addEventListener('click', () => {
        counter.count++;
        counter.display.textContent = String(counter.count);
      });

      countWrap.appendChild(minusBtn);
      countWrap.appendChild(countDisplay);
      countWrap.appendChild(plusBtn);

      row.appendChild(dot);
      row.appendChild(text);
      row.appendChild(countWrap);
      newList.appendChild(row);
    }

    panel.appendChild(newList);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #e2e8f0';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.background = '#f8fafc';
    cancelBtn.style.color = '#475569';
    cancelBtn.style.fontSize = '13px';
    cancelBtn.style.fontWeight = '500';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.fontFamily = 'inherit';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const okBtn = document.createElement('button');
    okBtn.textContent = isEditing ? 'Update' : 'Connect';
    okBtn.style.padding = '8px 16px';
    okBtn.style.border = 'none';
    okBtn.style.borderRadius = '6px';
    okBtn.style.background = '#0f172a';
    okBtn.style.color = '#ffffff';
    okBtn.style.fontSize = '13px';
    okBtn.style.fontWeight = '600';
    okBtn.style.cursor = 'pointer';
    okBtn.style.fontFamily = 'inherit';
    okBtn.addEventListener('click', () => {
      const selectedExisting = existingCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);

      const newConductorIds: string[] = [];
      for (const pc of profileCounters) {
        for (let i = 0; i < pc.count; i++) {
          const c = this.store.addConductor(pc.profileId);
          if (c) newConductorIds.push(c.id);
        }
      }

      const allIds = [...selectedExisting, ...newConductorIds];

      if (allIds.length > 0) {
        if (isEditing && this.selectedConnectionId) {
          this.store.updateConnection(this.selectedConnectionId, allIds);
        } else {
          this.store.addConnection(from, to, via, allIds);
        }
        this.foreground.invalidate();
      }
      overlay.remove();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  private showModuleCableSelector(fromModuleId: string, toModuleId: string): void {
    this.removeCableSelector();

    const fromMod = this.store.getModule(fromModuleId);
    const toMod = this.store.getModule(toModuleId);
    if (!fromMod || !toMod) return;

    const conductors = this.store.getModuleConductors(fromModuleId);
    if (conductors.length === 0) return;

    const overlay = document.createElement('div');
    overlay.className = 'cable-selector-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.35)';
    overlay.style.zIndex = '2000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const panel = document.createElement('div');
    panel.style.background = '#ffffff';
    panel.style.borderRadius = '10px';
    panel.style.padding = '24px';
    panel.style.minWidth = '380px';
    panel.style.maxWidth = '480px';
    panel.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18)';

    const title = document.createElement('div');
    title.textContent = `Connect ${fromMod.name} → ${toMod.name}`;
    title.style.fontSize = '14px';
    title.style.fontWeight = '700';
    title.style.color = '#0f172a';
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    const sub = document.createElement('div');
    sub.textContent = 'Select cables to share between modules';
    sub.style.fontSize = '12px';
    sub.style.color = '#64748b';
    sub.style.marginBottom = '16px';
    panel.appendChild(sub);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';
    list.style.marginBottom = '16px';

    const checkboxes: HTMLInputElement[] = [];

    for (const c of conductors) {
      const profile = getProfile(c.profileId);
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.padding = '6px 8px';
      row.style.borderRadius = '6px';
      row.style.cursor = 'pointer';
      row.style.transition = 'background 0.15s';
      row.addEventListener('mouseenter', () => { row.style.background = '#f1f5f9'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = c.id;
      cb.style.width = '16px';
      cb.style.height = '16px';
      cb.style.cursor = 'pointer';
      checkboxes.push(cb);

      const dot = document.createElement('span');
      dot.style.width = '14px';
      dot.style.height = '14px';
      dot.style.borderRadius = '3px';
      dot.style.background = profile?.color || '#999';
      if (profile?.color.toLowerCase() === '#f8fafc' || profile?.color.toLowerCase() === '#ffffff') {
        dot.style.border = '1.5px solid #cbd5e1';
      }
      dot.style.flexShrink = '0';

      const text = document.createElement('span');
      text.textContent = `${c.wireLabel}: ${profile?.label || c.profileId} (${profile?.function || '?'})`;
      text.style.fontSize = '12px';
      text.style.color = '#334155';
      text.style.flex = '1';

      row.appendChild(cb);
      row.appendChild(dot);
      row.appendChild(text);
      list.appendChild(row);
    }

    panel.appendChild(list);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #e2e8f0';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.background = '#f8fafc';
    cancelBtn.style.color = '#475569';
    cancelBtn.style.fontSize = '13px';
    cancelBtn.style.fontWeight = '500';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.fontFamily = 'inherit';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
    });

    const okBtn = document.createElement('button');
    okBtn.textContent = 'Link';
    okBtn.style.padding = '8px 16px';
    okBtn.style.border = 'none';
    okBtn.style.borderRadius = '6px';
    okBtn.style.background = '#0f172a';
    okBtn.style.color = '#ffffff';
    okBtn.style.fontSize = '13px';
    okBtn.style.fontWeight = '600';
    okBtn.style.cursor = 'pointer';
    okBtn.style.fontFamily = 'inherit';
    okBtn.addEventListener('click', () => {
      const selectedIds = checkboxes.filter((cb) => cb.checked).map((cb) => cb.value);
      if (selectedIds.length > 0) {
        this.store.addModuleLink(fromModuleId, toModuleId, selectedIds);
        this.masterModuleOriginId = null;
        this.foreground.setMasterOriginId(null);
        this.foreground.invalidate();
      }
      overlay.remove();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  destroy(): void {
    // listeners bound to canvas, removed with canvas
  }
}
