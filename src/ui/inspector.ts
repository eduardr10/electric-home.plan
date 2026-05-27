import { Store } from '../core/store.ts';
import { getProfile } from '../core/profiles.ts';
import { EventBus } from '../events.ts';

export class Inspector {
  private element: HTMLElement;
  private selectedNodeId: string | null = null;
  private selectedConnectionId: string | null = null;

  constructor(private readonly container: HTMLElement, private readonly store: Store, private readonly events: EventBus) {
    this.element = document.createElement('div');
    this.element.className = 'inspector';
    this.container.appendChild(this.element);
    this.render();
  }

  selectNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    if (nodeId) this.selectedConnectionId = null;
    this.render();
  }

  selectConnection(connId: string | null): void {
    this.selectedConnectionId = connId;
    if (connId) this.selectedNodeId = null;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'inspector-header';
    header.textContent = 'Properties';
    this.element.appendChild(header);

    if (this.selectedNodeId) {
      this.renderNodeInspector();
      return;
    }

    if (this.selectedConnectionId) {
      this.renderConnectionInspector();
      return;
    }

    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>Select a component or cable</span>';
    this.element.appendChild(empty);
  }

  private renderNodeInspector(): void {
    const node = this.store.getNode(this.selectedNodeId!);
    if (!node) {
      this.selectNode(null);
      return;
    }

    const fields = [
      { label: 'ID', value: node.id, readonly: true },
      { label: 'Type', value: node.type, readonly: true },
      {
        label: 'Label',
        value: node.label,
        onChange: (v: string) => this.store.updateNodeLabel(node.id, v),
      },
      {
        label: 'X',
        value: String(node.position.x),
        onChange: (v: string) => this.store.updateNodePosition(node.id, { x: Number(v), y: node.position.y }),
      },
      {
        label: 'Y',
        value: String(node.position.y),
        onChange: (v: string) => this.store.updateNodePosition(node.id, { x: node.position.x, y: Number(v) }),
      },
    ];

    for (const field of fields) {
      const row = document.createElement('div');
      row.className = 'inspector-row';

      const label = document.createElement('label');
      label.textContent = field.label;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = field.value;
      input.spellcheck = false;
      if (field.readonly) {
        input.readOnly = true;
        input.className = 'readonly';
      } else if (field.onChange) {
        input.addEventListener('change', (e) => {
          const target = e.target as HTMLInputElement;
          field.onChange!(target.value);
        });
      }

      row.appendChild(label);
      row.appendChild(input);
      this.element.appendChild(row);
    }

    const connections = this.store.getAllConnections().filter((c) => c.from === node.id || c.to === node.id || c.via.includes(node.id));
    if (connections.length > 0) {
      const connHeader = document.createElement('div');
      connHeader.className = 'inspector-subheader';
      connHeader.textContent = `Connections (${connections.length})`;
      this.element.appendChild(connHeader);

      const connList = document.createElement('div');
      connList.className = 'inspector-conn-list';
      for (const conn of connections) {
        const path = [conn.from, ...conn.via, conn.to];
        const idx = path.indexOf(node.id);
        const prev = idx > 0 ? this.store.getNode(path[idx - 1]) : null;
        const next = idx < path.length - 1 ? this.store.getNode(path[idx + 1]) : null;

        const item = document.createElement('div');
        item.className = 'inspector-conn-item';

        const dots = document.createElement('div');
        dots.style.display = 'flex';
        dots.style.gap = '3px';
        dots.style.flexWrap = 'wrap';

        for (const cid of conn.conductorIds) {
          const c = this.store.getConductor(cid);
          if (!c) continue;
          const profile = getProfile(c.profileId);
          const dot = document.createElement('span');
          dot.className = 'conn-dot';
          dot.style.background = profile?.color || '#999';
          dot.title = `${c.wireLabel}: ${profile?.label || c.profileId} (${profile?.function || '?'})`;
          dots.appendChild(dot);
        }

        const text = document.createElement('span');
        const prevLabel = prev?.label || prev?.type || '?';
        const nextLabel = next?.label || next?.type || '?';
        text.textContent = `-> ${prevLabel} -> ${nextLabel}`;
        text.style.fontSize = '11px';
        text.style.color = '#475569';
        text.style.flex = '1';
        text.style.overflow = 'hidden';
        text.style.textOverflow = 'ellipsis';
        text.style.whiteSpace = 'nowrap';
        text.style.minWidth = '0';

        item.appendChild(dots);
        item.appendChild(text);
        connList.appendChild(item);
      }
      this.element.appendChild(connList);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Component';
    deleteBtn.className = 'inspector-delete-btn';
    deleteBtn.addEventListener('click', () => {
      if (this.selectedNodeId) {
        this.store.removeNode(this.selectedNodeId);
        this.selectNode(null);
      }
    });
    this.element.appendChild(deleteBtn);
  }

  private renderConnectionInspector(): void {
    const conn = this.store.getConnection(this.selectedConnectionId!);
    if (!conn) {
      this.selectConnection(null);
      return;
    }

    const path = [conn.from, ...conn.via, conn.to];
    const labels = path.map((id) => this.store.getNode(id)?.label || id).join(' -> ');

    const pathRow = document.createElement('div');
    pathRow.style.fontSize = '12px';
    pathRow.style.color = '#64748b';
    pathRow.style.marginBottom = '12px';
    pathRow.style.overflow = 'hidden';
    pathRow.style.textOverflow = 'ellipsis';
    pathRow.style.whiteSpace = 'nowrap';
    pathRow.title = `Path: ${labels}`;
    pathRow.textContent = `Path: ${labels}`;
    this.element.appendChild(pathRow);

    const condHeader = document.createElement('div');
    condHeader.className = 'inspector-subheader';
    condHeader.textContent = `Cables (${conn.conductorIds.length})`;
    this.element.appendChild(condHeader);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';

    for (const cid of conn.conductorIds) {
      const c = this.store.getConductor(cid);
      if (!c) continue;
      const profile = getProfile(c.profileId);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.padding = '6px 8px';
      row.style.background = '#f8fafc';
      row.style.borderRadius = '4px';

      const dot = document.createElement('span');
      dot.style.width = '12px';
      dot.style.height = '12px';
      dot.style.borderRadius = '3px';
      dot.style.background = profile?.color || '#999';
      dot.style.border = '1px solid #e2e8f0';

      const text = document.createElement('span');
      text.style.fontSize = '12px';
      text.style.color = '#334155';
      text.textContent = `${c.wireLabel}: ${profile?.label || c.profileId} (${profile?.function || '?'})`;

      row.appendChild(dot);
      row.appendChild(text);
      list.appendChild(row);
    }
    this.element.appendChild(list);

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit Cables';
    editBtn.className = 'inspector-delete-btn';
    editBtn.style.background = '#0f172a';
    editBtn.style.marginTop = '12px';
    editBtn.addEventListener('click', () => {
      if (this.selectedConnectionId) {
        this.events.emit('inspector:editConnection', this.selectedConnectionId);
      }
    });
    this.element.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Connection';
    deleteBtn.className = 'inspector-delete-btn';
    deleteBtn.style.marginTop = '8px';
    deleteBtn.addEventListener('click', () => {
      if (this.selectedConnectionId) {
        this.store.removeConnection(this.selectedConnectionId);
        this.selectConnection(null);
      }
    });
    this.element.appendChild(deleteBtn);
  }

  destroy(): void {
    this.element.remove();
  }
}
