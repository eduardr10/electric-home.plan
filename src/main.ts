import { EventBus } from './events.ts';
import { Store } from './core/store.ts';
import { BackgroundRenderer } from './renderer/background.ts';
import { ForegroundRenderer } from './renderer/foreground.ts';
import { CanvasController } from './renderer/interaction.ts';
import { Toolbar } from './ui/toolbar.ts';
import { ModuleList } from './ui/module-list.ts';
import { Inspector } from './ui/inspector.ts';
import { ProfileManager } from './ui/profile-manager.ts';
import { exportSVG, downloadSVG } from './export/svg-export.ts';

export function initApp(container: HTMLElement): void {
  const events = new EventBus();
  const store = new Store(events);

  const layout = document.createElement('div');
  layout.className = 'app-layout';
  container.appendChild(layout);

  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';
  layout.appendChild(sidebar);

  const mainArea = document.createElement('div');
  mainArea.className = 'main-area';
  layout.appendChild(mainArea);

  const topBar = document.createElement('div');
  topBar.className = 'top-bar';

  const topBarLeft = document.createElement('div');
  topBarLeft.className = 'top-bar-left';
  topBarLeft.innerHTML = '<span class="logo">Electric</span><span class="tagline">ElectroPlan</span>';
  topBar.appendChild(topBarLeft);

  const topBarCenter = document.createElement('div');
  topBarCenter.className = 'top-bar-center';
  topBar.appendChild(topBarCenter);

  const topBarRight = document.createElement('div');
  topBarRight.className = 'top-bar-right';
  topBar.appendChild(topBarRight);

  mainArea.appendChild(topBar);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'canvas-wrap';
  mainArea.appendChild(canvasWrap);

  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'canvas-container';
  canvasWrap.appendChild(canvasContainer);

  const background = new BackgroundRenderer(canvasContainer);
  const foreground = new ForegroundRenderer(canvasContainer, store);
  const inspector = new Inspector(sidebar, store, events);
  const toolbar = new Toolbar(topBarCenter);
  new ProfileManager(sidebar, events);
  const moduleList = new ModuleList(sidebar, store);
  const canvasController = new CanvasController(store, foreground, inspector, events);

  toolbar.setOnToolChange((tool) => {
    canvasController.setTool(tool);
  });

  moduleList.setCallbacks({
    onSelect: (id) => {
      store.setActiveModule(id);
      canvasController.clearSelection();
      moduleList.refresh();
      inspector.selectNode(null);
    },
    onCreate: () => {
      const name = prompt('Module name:', `Room ${store.getAllModules().length + 1}`);
      if (name) {
        store.createModule(name);
        moduleList.refresh();
      }
    },
    onDelete: (id) => {
      if (confirm('Delete this module?')) {
        store.removeModule(id);
        moduleList.refresh();
        inspector.selectNode(null);
      }
    },
    onRename: (id, name) => {
      store.renameModule(id, name);
      moduleList.refresh();
    },
  });

  events.on('store:nodeAdded', () => {
    foreground.invalidate();
  });
  events.on('store:nodeUpdated', () => {
    foreground.invalidate();
  });
  events.on('store:nodeRemoved', () => {
    foreground.invalidate();
  });
  events.on('store:connectionAdded', () => {
    foreground.invalidate();
  });
  events.on('store:connectionRemoved', () => {
    foreground.invalidate();
  });
  events.on('store:moduleActivated', () => {
    canvasController.clearSelection();
    const mod = store.getModule(store.getActiveModuleId() || '');
    if (mod) {
      background.setModuleSize(mod.size);
    }
    foreground.invalidate();
    moduleList.refresh();
  });
  events.on('store:moduleUpdated', () => {
    foreground.invalidate();
  });
  events.on('store:loaded', () => {
    const mod = store.getModule(store.getActiveModuleId() || '');
    if (mod) {
      background.setModuleSize(mod.size);
    }
    foreground.invalidate();
    moduleList.refresh();
    inspector.selectNode(null);
  });
  // events.on('store:validated', (payload) => {
  //   const data = payload as { errors: readonly { id: string; message: string; type: string }[] };
  //   updateErrorPanel(data.errors);
  // });

  const actionBar = document.createElement('div');
  actionBar.className = 'action-bar';
  mainArea.appendChild(actionBar);

  const makeBtn = (label: string, icon: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.innerHTML = `${icon}<span>${label}</span>`;
    btn.addEventListener('click', onClick);
    return btn;
  };

  actionBar.appendChild(
    makeBtn(
      'Export SVG',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      () => {
        const { svg } = exportSVG(store.getAllNodes(), store.getAllConnections(), store.getAllConductors());
        downloadSVG(svg);
      }
    )
  );

  actionBar.appendChild(
    makeBtn(
      'Save',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
      () => store.downloadJSON()
    )
  );

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      await store.uploadJSON(target.files[0]);
    }
  });

  actionBar.appendChild(
    makeBtn(
      'Load',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      () => fileInput.click()
    )
  );
  actionBar.appendChild(fileInput);

  actionBar.appendChild(
    makeBtn(
      'Print',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
      () => window.print()
    )
  );

  /*
  const errorPanel = document.createElement('div');
  errorPanel.className = 'error-panel';
  mainArea.appendChild(errorPanel);

  function updateErrorPanel(errors: readonly { id: string; message: string; type: string }[]): void {
    errorPanel.innerHTML = '';
    if (errors.length === 0) {
      errorPanel.classList.remove('visible');
      return;
    }
    errorPanel.classList.add('visible');
    const header = document.createElement('div');
    header.className = 'error-panel-header';
    header.textContent = `${errors.length} issue${errors.length > 1 ? 's' : ''}`;
    errorPanel.appendChild(header);
    const list = document.createElement('div');
    list.className = 'error-panel-list';
    for (const err of errors) {
      const item = document.createElement('div');
      item.className = 'error-panel-item';
      item.textContent = err.message;
      list.appendChild(item);
    }
    errorPanel.appendChild(list);
  }
  */

  const printContainer = document.createElement('div');
  printContainer.className = 'print-only';
  container.appendChild(printContainer);

  window.addEventListener('beforeprint', () => {
    const { svg } = exportSVG(store.getAllNodes(), store.getAllConnections(), store.getAllConductors());
    printContainer.innerHTML = svg;
  });

  if (!store.tryLoadFromStorage()) {
    store.createModule('Default Room');
  }
  moduleList.refresh();

  actionBar.appendChild(
    makeBtn(
      'New Project',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
      () => {
        if (confirm('Start a new project? All unsaved changes will be lost.')) {
          store.clearStorage();
          location.reload();
        }
      }
    )
  );
}

const appContainer = document.getElementById('app');
if (appContainer) {
  initApp(appContainer);
}
