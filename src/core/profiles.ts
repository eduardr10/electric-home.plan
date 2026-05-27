import { CableProfile, WireFunction } from './types.ts';

const PROFILE_MAP = new Map<string, CableProfile>();

export interface CableTemplate {
  readonly gauge: string;
  readonly width: number;
  readonly colors: { readonly id: string; readonly color: string; readonly name: string }[];
  readonly functions: readonly WireFunction[];
}

export const CABLE_TEMPLATES: readonly CableTemplate[] = [
  {
    gauge: '#12 AWG',
    width: 2.5,
    colors: [
      { id: 'red', color: '#ef4444', name: 'Red' },
      { id: 'white', color: '#f8fafc', name: 'White' },
    ],
    functions: ['fase', 'neutro'],
  },
  {
    gauge: '#14 AWG',
    width: 2,
    colors: [
      { id: 'yellow', color: '#f59e0b', name: 'Yellow' },
      { id: 'red', color: '#dc2626', name: 'Red' },
    ],
    functions: ['fase', 'neutro', 'retorno'],
  },
  {
    gauge: '#12 AWG Ground',
    width: 2.5,
    colors: [
      { id: 'green', color: '#22c55e', name: 'Green' },
    ],
    functions: ['tierra'],
  },
];

function generateProfiles(): void {
  PROFILE_MAP.clear();
  for (const tmpl of CABLE_TEMPLATES) {
    for (const col of tmpl.colors) {
      for (const fn of tmpl.functions) {
        const id = `${tmpl.gauge.replace(/\s+/g, '_')}_${col.id}_${fn}`;
        const label = `${tmpl.gauge} ${col.name} (${fn})`;
        PROFILE_MAP.set(id, {
          id,
          color: col.color,
          width: tmpl.width,
          label,
          function: fn,
        });
      }
    }
  }
}

generateProfiles();

export function getProfile(id: string): CableProfile | undefined {
  return PROFILE_MAP.get(id);
}

export function getAllProfiles(): readonly CableProfile[] {
  return Array.from(PROFILE_MAP.values());
}

export function hasProfile(id: string): boolean {
  return PROFILE_MAP.has(id);
}

export function addProfile(profile: CableProfile): void {
  PROFILE_MAP.set(profile.id, profile);
}

export function removeProfile(id: string): void {
  PROFILE_MAP.delete(id);
}

export function updateProfile(id: string, updates: Partial<Omit<CableProfile, 'id'>>): CableProfile | undefined {
  const existing = PROFILE_MAP.get(id);
  if (!existing) return undefined;
  const updated: CableProfile = { ...existing, ...updates };
  PROFILE_MAP.set(id, updated);
  return updated;
}

export function profilesToJSON(): string {
  return JSON.stringify(Array.from(PROFILE_MAP.entries()));
}

export function profilesFromJSON(json: string): void {
  const entries = JSON.parse(json) as [string, CableProfile][];
  PROFILE_MAP.clear();
  for (const [id, profile] of entries) {
    PROFILE_MAP.set(id, profile);
  }
}

export function getProfilesByGaugeAndFunction(gauge: string, func: WireFunction): CableProfile[] {
  return getAllProfiles().filter((p) => p.label.startsWith(gauge) && p.function === func);
}
