import { ComponentType } from '../core/types.ts';

export type ToolType = ComponentType | 'select' | 'connect' | 'master';

const ICONS: Record<ToolType, string> = {
  select:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>',
  connect:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  junction_box:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/></svg>',
  outlet:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><path d="M12 8v2M9 14h6"/></svg>',
  switch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M14.5 9.5l4-4"/></svg>',
  lamp:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  panel:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 14h18"/></svg>',
  master:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
};

export class Toolbar {
  private element: HTMLElement;
  private currentTool: ToolType = 'select';
  private onToolChange?: (tool: ToolType) => void;

  constructor(private readonly container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'toolbar';
    this.container.appendChild(this.element);
    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';

    const tools: { id: ToolType; label: string }[] = [
      { id: 'select', label: 'Select' },
      { id: 'connect', label: 'Connect' },
      { id: 'junction_box', label: 'Junction' },
      { id: 'outlet', label: 'Outlet' },
      { id: 'switch', label: 'Switch' },
      { id: 'lamp', label: 'Lamp' },
      { id: 'panel', label: 'Panel' },
      { id: 'master', label: 'Master' },
    ];

    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.title = tool.label;
      btn.dataset.tool = tool.id;
      btn.innerHTML = ICONS[tool.id] + `<span>${tool.label}</span>`;
      if (tool.id === this.currentTool) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        this.currentTool = tool.id;
        this.onToolChange?.(tool.id);
        this.updateActive();
      });
      this.element.appendChild(btn);
    }
  }

  private updateActive(): void {
    const buttons = this.element.querySelectorAll('.toolbar-btn');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === this.currentTool);
    });
  }

  getTool(): ToolType {
    return this.currentTool;
  }

  setOnToolChange(callback: (tool: ToolType) => void): void {
    this.onToolChange = callback;
  }

  destroy(): void {
    this.element.remove();
  }
}
