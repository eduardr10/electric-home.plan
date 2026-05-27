import { Store } from '../core/store.ts';

export class ModuleList {
  private element: HTMLElement;
  private onSelectModule?: (id: string) => void;
  private onCreateModule?: () => void;
  private onDeleteModule?: (id: string) => void;
  private onRenameModule?: (id: string, name: string) => void;

  constructor(private readonly container: HTMLElement, private readonly store: Store) {
    this.element = document.createElement('div');
    this.element.className = 'module-list';
    this.container.appendChild(this.element);
    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'module-list-header';

    const title = document.createElement('h3');
    title.textContent = 'Modules';

    const addBtn = document.createElement('button');
    addBtn.className = 'module-add-btn';
    addBtn.title = 'New module';
    addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
    addBtn.addEventListener('click', () => this.onCreateModule?.());

    header.appendChild(title);
    header.appendChild(addBtn);
    this.element.appendChild(header);

    const list = document.createElement('div');
    list.className = 'module-list-items';

    const modules = this.store.getAllModules();
    const activeId = this.store.getActiveModuleId();

    for (const mod of modules) {
      const item = document.createElement('div');
      item.className = 'module-item';
      if (mod.id === activeId) {
        item.classList.add('active');
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'module-name';
      nameSpan.textContent = mod.name;
      nameSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = mod.name;
        input.className = 'module-rename-input';
        input.addEventListener('blur', () => {
          this.onRenameModule?.(mod.id, input.value || mod.name);
        });
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            this.onRenameModule?.(mod.id, input.value || mod.name);
          }
        });
        item.replaceChild(input, nameSpan);
        input.focus();
        input.select();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'module-delete-btn';
      delBtn.title = 'Delete';
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onDeleteModule?.(mod.id);
      });

      item.appendChild(nameSpan);
      item.appendChild(delBtn);
      item.addEventListener('click', () => this.onSelectModule?.(mod.id));
      list.appendChild(item);
    }

    this.element.appendChild(list);
  }

  refresh(): void {
    this.render();
  }

  setCallbacks(callbacks: {
    onSelect?: (id: string) => void;
    onCreate?: () => void;
    onDelete?: (id: string) => void;
    onRename?: (id: string, name: string) => void;
  }): void {
    this.onSelectModule = callbacks.onSelect;
    this.onCreateModule = callbacks.onCreate;
    this.onDeleteModule = callbacks.onDelete;
    this.onRenameModule = callbacks.onRename;
  }

  destroy(): void {
    this.element.remove();
  }
}
