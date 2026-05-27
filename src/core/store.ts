import { Node, Connection, Module, ModuleLink, SnapAnchor, Point, Size, Conductor } from './types.ts';
import { EventBus } from '../events.ts';
import { getProfile, hasProfile, profilesToJSON, profilesFromJSON } from './profiles.ts';
import { validateWithProfiles, ValidationError } from './validator.ts';

const GRID_STEP = 40;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP;
}

function snapPointToGrid(point: Point): Point {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
}

function subscriptNumber(n: number): string {
  const subs = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return String(n)
    .split('')
    .map((d) => subs[Number(d)])
    .join('');
}

function generateWireLabel(index: number): string {
  return 'w' + subscriptNumber(index);
}

function getNextWireIndex(mod: Module): number {
  let max = 0;
  for (const c of mod.conductors.values()) {
    const match = c.wireLabel.match(/w(\d+)/);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

function getNextNodeLabel(allNodes: readonly Node[], type: string): string {
  const prefixMap: Record<string, string> = {
    junction_box: 'Jb',
    outlet: 'Tc',
    switch: 'Sw',
    lamp: 'b',
    panel: 'P',
  };
  const prefix = prefixMap[type] || 'N';
  let max = 0;
  for (const node of allNodes) {
    if (node.type === type) {
      const match = node.label.match(new RegExp(`^${prefix}(\\d+)$`));
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
  }
  return prefix + subscriptNumber(max + 1);
}

function isLabelUniqueGlobally(modules: Map<string, Module>, label: string, excludeId: string): boolean {
  for (const mod of modules.values()) {
    for (const [id, node] of mod.nodes.entries()) {
      if (id !== excludeId && node.label === label) {
        return false;
      }
    }
  }
  return true;
}

const STORAGE_KEY = 'electric_project';

export class Store {
  private modules = new Map<string, Module>();
  private moduleLinks = new Map<string, ModuleLink>();
  private activeModuleId: string | null = null;
  private lastValidationErrors: readonly ValidationError[] = [];

  constructor(private readonly events: EventBus) {}

  private autosave(): void {
    try {
      localStorage.setItem(STORAGE_KEY, this.toJSON());
    } catch {
      // ignore storage errors
    }
  }

  tryLoadFromStorage(): boolean {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.fromJSON(data);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  clearStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private getActiveModule(): Module | undefined {
    if (!this.activeModuleId) return undefined;
    return this.modules.get(this.activeModuleId);
  }

  private runValidation(): void {
    const mod = this.getActiveModule();
    if (!mod) return;
    const flatConnections: { from: string; to: string; profileId: string }[] = [];
    for (const conn of mod.connections.values()) {
      const path = [conn.from, ...conn.via, conn.to];
      for (let i = 0; i < path.length - 1; i++) {
        for (const cid of conn.conductorIds) {
          const conductor = mod.conductors.get(cid);
          if (conductor) {
            flatConnections.push({ from: path[i], to: path[i + 1], profileId: conductor.profileId });
          }
        }
      }
    }
    this.lastValidationErrors = validateWithProfiles(
      mod.nodes,
      flatConnections,
      (profileId) => getProfile(profileId)?.function
    );
    this.events.emit('store:validated', { errors: this.lastValidationErrors });
  }

  getValidationErrors(): readonly ValidationError[] {
    return this.lastValidationErrors;
  }

  setActiveModule(id: string): void {
    if (!this.modules.has(id)) return;
    this.activeModuleId = id;
    this.runValidation();
    this.events.emit('store:moduleActivated', id);
    this.autosave();
  }

  getActiveModuleId(): string | null {
    return this.activeModuleId;
  }

  createModule(name: string): Module {
    const id = `mod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const module: Module = {
      id,
      name,
      position: { x: 0, y: 0 },
      size: { width: 800, height: 600 },
      nodes: new Map(),
      connections: new Map(),
      conductors: new Map(),
      snapAnchors: [],
    };
    this.modules.set(id, module);
    this.events.emit('store:moduleAdded', { id, name });
    this.autosave();
    if (!this.activeModuleId) {
      this.setActiveModule(id);
    }
    return module;
  }

  renameModule(id: string, name: string): void {
    const mod = this.modules.get(id);
    if (!mod) return;
    const updated: Module = { ...mod, name };
    this.modules.set(id, updated);
    this.events.emit('store:moduleRenamed', { id, name });
    this.autosave();
  }

  updateModulePosition(id: string, position: Point): void {
    const mod = this.modules.get(id);
    if (!mod) return;
    const updated: Module = { ...mod, position };
    this.modules.set(id, updated);
    this.events.emit('store:moduleUpdated', { id });
    this.autosave();
  }

  removeModule(id: string): void {
    this.modules.delete(id);
    if (this.activeModuleId === id) {
      const next = this.modules.keys().next().value;
      this.activeModuleId = next || null;
      this.runValidation();
    }
    this.events.emit('store:moduleRemoved', id);
    this.autosave();
  }

  getModule(id: string): Module | undefined {
    return this.modules.get(id);
  }

  getAllModules(): readonly Module[] {
    return Array.from(this.modules.values());
  }

  addNode(type: Node['type'], position: Point): Node {
    const mod = this.getActiveModule();
    if (!mod) throw new Error('No active module');
    const id = `${mod.id}_node_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const snapped = snapPointToGrid(position);
    const allNodes = this.getAllNodesGlobal();
    const label = getNextNodeLabel(allNodes, type);
    const node: Node = { id, type, position: snapped, label };
    mod.nodes.set(id, node);
    this.runValidation();
    this.events.emit('store:nodeAdded', { id: node.id, type: node.type });
    this.autosave();
    return node;
  }

  updateNodeLabel(id: string, label: string): boolean {
    const mod = this.getActiveModule();
    if (!mod) return false;
    const existing = mod.nodes.get(id);
    if (!existing) return false;
    if (label === existing.label) return true;

    if (!isLabelUniqueGlobally(this.modules, label, id)) {
      const allNodes = this.getAllNodesGlobal();
      const newLabel = getNextNodeLabel(allNodes, existing.type);
      const updated: Node = { ...existing, label: newLabel };
      mod.nodes.set(id, updated);
      this.runValidation();
      this.events.emit('store:nodeUpdated', { id });
      return false;
    }

    const updated: Node = { ...existing, label };
    mod.nodes.set(id, updated);
    this.runValidation();
    this.events.emit('store:nodeUpdated', { id });
    this.autosave();
    return true;
  }

  updateNodePosition(id: string, position: Point): void {
    const mod = this.getActiveModule();
    if (!mod) return;
    const existing = mod.nodes.get(id);
    if (!existing) return;
    const snapped = snapPointToGrid(position);
    const updated: Node = { ...existing, position: snapped };
    mod.nodes.set(id, updated);
    this.runValidation();
    this.events.emit('store:nodeUpdated', { id });
    this.autosave();
  }

  removeNode(id: string): void {
    const mod = this.getActiveModule();
    if (!mod) return;
    mod.nodes.delete(id);
    const toRemoveConns: string[] = [];
    for (const [connId, conn] of mod.connections.entries()) {
      if (conn.from === id || conn.to === id || conn.via.includes(id)) {
        toRemoveConns.push(connId);
      }
    }
    for (const connId of toRemoveConns) {
      mod.connections.delete(connId);
    }
    this.runValidation();
    this.events.emit('store:nodeRemoved', id);
    this.autosave();
  }

  getNode(id: string): Node | undefined {
    const mod = this.getActiveModule();
    return mod?.nodes.get(id);
  }

  getAllNodes(): readonly Node[] {
    const mod = this.getActiveModule();
    return mod ? Array.from(mod.nodes.values()) : [];
  }

  getAllNodesGlobal(): readonly Node[] {
    const nodes: Node[] = [];
    for (const mod of this.modules.values()) {
      nodes.push(...mod.nodes.values());
    }
    return nodes;
  }

  addConductor(profileId: string): Conductor | null {
    const mod = this.getActiveModule();
    if (!mod) return null;
    if (!hasProfile(profileId)) return null;

    const id = `cond_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const wireLabel = generateWireLabel(getNextWireIndex(mod));
    const conductor: Conductor = { id, wireLabel, profileId };
    mod.conductors.set(id, conductor);
    this.runValidation();
    this.autosave();
    return conductor;
  }

  removeConductor(id: string): void {
    const mod = this.getActiveModule();
    if (!mod) return;
    mod.conductors.delete(id);
    for (const [connId, conn] of mod.connections.entries()) {
      const updatedIds = conn.conductorIds.filter((cid) => cid !== id);
      if (updatedIds.length !== conn.conductorIds.length) {
        if (updatedIds.length === 0) {
          mod.connections.delete(connId);
        } else {
          const updated: Connection = { ...conn, conductorIds: updatedIds };
          mod.connections.set(connId, updated);
        }
      }
    }
    this.runValidation();
    this.autosave();
  }

  getConductor(id: string): Conductor | undefined {
    const mod = this.getActiveModule();
    return mod?.conductors.get(id);
  }

  getAllConductors(): readonly Conductor[] {
    const mod = this.getActiveModule();
    return mod ? Array.from(mod.conductors.values()) : [];
  }

  getModuleConductors(moduleId: string): readonly Conductor[] {
    const mod = this.modules.get(moduleId);
    return mod ? Array.from(mod.conductors.values()) : [];
  }

  addConnection(from: string, to: string, via: readonly string[], conductorIds: readonly string[]): Connection | null {
    const mod = this.getActiveModule();
    if (!mod) return null;

    const validIds = conductorIds.filter((cid) => mod.conductors.has(cid));
    if (validIds.length === 0) return null;

    const id = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const connection: Connection = { id, from, to, via, conductorIds: validIds };
    mod.connections.set(id, connection);
    this.runValidation();
    this.events.emit('store:connectionAdded', { id });
    this.autosave();
    return connection;
  }

  updateConnection(id: string, conductorIds: readonly string[]): Connection | null {
    const mod = this.getActiveModule();
    if (!mod) return null;
    const existing = mod.connections.get(id);
    if (!existing) return null;

    const validIds = conductorIds.filter((cid) => mod.conductors.has(cid));
    if (validIds.length === 0) {
      mod.connections.delete(id);
      this.runValidation();
      this.events.emit('store:connectionRemoved', id);
      return null;
    }

    const updated: Connection = { ...existing, conductorIds: validIds };
    mod.connections.set(id, updated);
    this.runValidation();
    this.events.emit('store:connectionAdded', { id });
    this.autosave();
    return updated;
  }

  removeConnection(id: string): void {
    const mod = this.getActiveModule();
    if (!mod) return;
    mod.connections.delete(id);
    this.runValidation();
    this.events.emit('store:connectionRemoved', id);
    this.autosave();
  }

  removeWaypointFromConnection(connectionId: string, waypointId: string): void {
    const mod = this.getActiveModule();
    if (!mod) return;
    const conn = mod.connections.get(connectionId);
    if (!conn) return;
    if (!conn.via.includes(waypointId)) return;
    const updatedVia = conn.via.filter((id) => id !== waypointId);
    const updated: Connection = { ...conn, via: updatedVia };
    mod.connections.set(connectionId, updated);
    this.runValidation();
    this.events.emit('store:connectionUpdated', { id: connectionId });
    this.autosave();
  }

  getConnection(id: string): Connection | undefined {
    const mod = this.getActiveModule();
    return mod?.connections.get(id);
  }

  getAllConnections(): readonly Connection[] {
    const mod = this.getActiveModule();
    return mod ? Array.from(mod.connections.values()) : [];
  }

  toJSON(): string {
    const data = {
      modules: Array.from(this.modules.entries()).map(([id, mod]) => ({
        id,
        name: mod.name,
        position: mod.position,
        size: mod.size,
        nodes: Array.from(mod.nodes.entries()),
        connections: Array.from(mod.connections.entries()),
        conductors: Array.from(mod.conductors.entries()),
        snapAnchors: mod.snapAnchors,
      })),
      moduleLinks: Array.from(this.moduleLinks.entries()),
      activeModuleId: this.activeModuleId,
      profiles: profilesToJSON(),
    };
    return JSON.stringify(data);
  }

  fromJSON(json: string): void {
    const data = JSON.parse(json) as {
      modules: Array<{
        id: string;
        name: string;
        position: Point;
        size: Size;
        nodes: [string, Node][];
        connections: [string, Connection][];
        conductors: [string, Conductor][];
        snapAnchors: SnapAnchor[];
      }>;
      moduleLinks?: [string, ModuleLink][];
      activeModuleId: string | null;
      profiles: string;
    };
    profilesFromJSON(data.profiles);
    this.modules = new Map(
      data.modules.map((m) => [
        m.id,
        {
          id: m.id,
          name: m.name,
          position: m.position,
          size: m.size,
          nodes: new Map(m.nodes),
          connections: new Map(m.connections),
          conductors: new Map(m.conductors),
          snapAnchors: m.snapAnchors,
        } as Module,
      ])
    );
    this.moduleLinks = new Map(data.moduleLinks || []);
    this.activeModuleId = data.activeModuleId;
    if (this.activeModuleId && !this.modules.has(this.activeModuleId)) {
      this.activeModuleId = this.modules.keys().next().value || null;
    }
    this.runValidation();
    this.events.emit('store:loaded', this);
  }

  addModuleLink(fromModuleId: string, toModuleId: string, conductorIds: readonly string[]): ModuleLink | null {
    const fromMod = this.modules.get(fromModuleId);
    const toMod = this.modules.get(toModuleId);
    if (!fromMod || !toMod || fromModuleId === toModuleId) return null;

    const validIds = conductorIds.filter((cid) => fromMod.conductors.has(cid));
    if (validIds.length === 0) return null;

    // Clone shared conductors into destination module so they are available there
    for (const cid of validIds) {
      const cond = fromMod.conductors.get(cid);
      if (cond && !toMod.conductors.has(cid)) {
        toMod.conductors.set(cid, cond);
      }
    }

    const id = `link_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const link: ModuleLink = { id, fromModuleId, toModuleId, conductorIds: validIds };
    this.moduleLinks.set(id, link);
    this.events.emit('store:moduleLinkAdded', { id });
    this.autosave();
    return link;
  }

  removeModuleLink(id: string): void {
    this.moduleLinks.delete(id);
    this.events.emit('store:moduleLinkRemoved', id);
    this.autosave();
  }

  getModuleLinks(): readonly ModuleLink[] {
    return Array.from(this.moduleLinks.values());
  }

  getModuleLinksFor(moduleId: string): readonly ModuleLink[] {
    return Array.from(this.moduleLinks.values()).filter(
      (l) => l.fromModuleId === moduleId || l.toModuleId === moduleId
    );
  }

  downloadJSON(filename = 'electric-project.json'): void {
    const blob = new Blob([this.toJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async uploadJSON(file: File): Promise<void> {
    const text = await file.text();
    this.fromJSON(text);
  }
}
