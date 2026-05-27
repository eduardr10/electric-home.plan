import { CableProfile, WireFunction } from '../core/types.ts';
import { getAllProfiles, addProfile, updateProfile, CABLE_TEMPLATES } from '../core/profiles.ts';
import { EventBus } from '../events.ts';

export class ProfileManager {
  private element: HTMLElement;

  constructor(private readonly container: HTMLElement, private readonly events: EventBus) {
    this.element = document.createElement('div');
    this.element.className = 'profile-manager';
    this.container.appendChild(this.element);
    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'profile-manager-header';
    header.textContent = 'Cable Library';
    this.element.appendChild(header);

    const list = document.createElement('div');
    list.className = 'profile-library';

    const profiles = getAllProfiles();
    const byGauge = new Map<string, CableProfile[]>();
    for (const p of profiles) {
      const gauge = p.label.split(' ').slice(0, 2).join(' ');
      const arr = byGauge.get(gauge) || [];
      arr.push(p);
      byGauge.set(gauge, arr);
    }

    for (const tmpl of CABLE_TEMPLATES) {
      const gaugeKey = tmpl.gauge;
      const group = byGauge.get(gaugeKey) || [];
      if (group.length === 0) continue;

      const section = document.createElement('div');
      section.className = 'profile-section';

      const secHeader = document.createElement('div');
      secHeader.className = 'profile-section-header';
      secHeader.textContent = gaugeKey;
      section.appendChild(secHeader);

      const grid = document.createElement('div');
      grid.className = 'profile-grid';

      for (const p of group) {
        const chip = document.createElement('div');
        chip.className = 'profile-chip';
        chip.title = p.label;

        const dot = document.createElement('span');
        dot.className = 'profile-chip-dot';
        dot.style.background = p.color;
        if (p.color.toLowerCase() === '#f8fafc' || p.color.toLowerCase() === '#ffffff') {
          dot.style.border = '1.5px solid #cbd5e1';
        }

        const text = document.createElement('span');
        text.className = 'profile-chip-text';
        const parts = p.label.split(' ');
        text.textContent = parts.slice(2).join(' '); // color + function

        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        editBtn.className = 'profile-chip-edit';
        editBtn.title = 'Edit';
        editBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.showEditForm(p);
        });

        chip.appendChild(dot);
        chip.appendChild(text);
        chip.appendChild(editBtn);
        grid.appendChild(chip);
      }

      section.appendChild(grid);
      list.appendChild(section);
    }

    this.element.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.className = 'profile-add-btn';
    addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><span>Custom Profile</span>';
    addBtn.addEventListener('click', () => this.showAddForm());
    this.element.appendChild(addBtn);
  }

  private showAddForm(): void {
    this.removeForm();
    const form = this.createForm('Add Custom Profile', null, (data) => {
      const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      addProfile({ id, ...data } as CableProfile);
      this.render();
      this.events.emit('profiles:changed', null);
    });
    this.element.appendChild(form);
  }

  private showEditForm(profile: CableProfile): void {
    this.removeForm();
    const form = this.createForm('Edit Profile', profile, (data) => {
      updateProfile(profile.id, data);
      this.render();
      this.events.emit('profiles:changed', null);
    });
    this.element.appendChild(form);
  }

  private removeForm(): void {
    const existing = this.element.querySelector('.profile-form');
    if (existing) existing.remove();
  }

  private createForm(title: string, existing: CableProfile | null, onSave: (data: Partial<Omit<CableProfile, 'id'>>) => void): HTMLElement {
    const form = document.createElement('div');
    form.className = 'profile-form';

    const header = document.createElement('div');
    header.className = 'profile-form-header';
    header.textContent = title;
    form.appendChild(header);

    const colorRow = document.createElement('div');
    colorRow.className = 'profile-form-row';
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = existing?.color || '#ef4444';
    colorRow.appendChild(colorLabel);
    colorRow.appendChild(colorInput);
    form.appendChild(colorRow);

    const labelRow = document.createElement('div');
    labelRow.className = 'profile-form-row';
    const labelLabel = document.createElement('label');
    labelLabel.textContent = 'Label';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.placeholder = 'e.g. #12 AWG THHN';
    labelInput.value = existing ? existing.label.split(' ').slice(2).join(' ') : '';
    labelRow.appendChild(labelLabel);
    labelRow.appendChild(labelInput);
    form.appendChild(labelRow);

    const widthRow = document.createElement('div');
    widthRow.className = 'profile-form-row';
    const widthLabel = document.createElement('label');
    widthLabel.textContent = 'Width (px)';
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.value = String(existing?.width || 2.5);
    widthInput.step = '0.5';
    widthRow.appendChild(widthLabel);
    widthRow.appendChild(widthInput);
    form.appendChild(widthRow);

    const funcRow = document.createElement('div');
    funcRow.className = 'profile-form-row';
    const funcLabel = document.createElement('label');
    funcLabel.textContent = 'Function';
    const funcSelect = document.createElement('select');
    const functions: WireFunction[] = ['fase', 'neutro', 'retorno', 'tierra'];
    for (const f of functions) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      if (existing?.function === f) opt.selected = true;
      funcSelect.appendChild(opt);
    }
    funcRow.appendChild(funcLabel);
    funcRow.appendChild(funcSelect);
    form.appendChild(funcRow);

    const btnRow = document.createElement('div');
    btnRow.className = 'profile-form-btns';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => form.remove());

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'primary';
    saveBtn.addEventListener('click', () => {
      onSave({
        color: colorInput.value,
        label: labelInput.value,
        width: Number(widthInput.value),
        function: funcSelect.value as WireFunction,
      });
      form.remove();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    form.appendChild(btnRow);

    return form;
  }

  destroy(): void {
    this.element.remove();
  }
}
