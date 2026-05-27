export type EventMap = {
  'store:nodeAdded': { id: string; type: string };
  'store:nodeUpdated': { id: string };
  'store:nodeRemoved': string;
  'store:connectionAdded': { id: string };
  'store:connectionUpdated': { id: string };
  'store:connectionRemoved': string;
  'store:moduleAdded': { id: string; name: string };
  'store:moduleRemoved': string;
  'store:moduleActivated': string;
  'store:moduleRenamed': { id: string; name: string };
  'store:moduleUpdated': { id: string };
  'store:moduleLinkAdded': { id: string };
  'store:moduleLinkRemoved': string;
  'store:loaded': unknown;
  'store:validated': { errors: readonly { id: string; message: string; type: string }[] };
  'canvas:nodeSelected': string | null;
  'canvas:connectionSelected': string | null;
  'inspector:editConnection': string;
  'profiles:changed': unknown;
};

export type EventName = keyof EventMap;
export type EventCallback<T extends EventName> = (payload: EventMap[T]) => void;

export class EventBus {
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  on<T extends EventName>(event: T, callback: EventCallback<T>): () => void {
    const key = event as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback as (payload: unknown) => void);
    return () => {
      this.listeners.get(key)?.delete(callback as (payload: unknown) => void);
    };
  }

  emit<T extends EventName>(event: T, payload?: EventMap[T]): void {
    const set = this.listeners.get(event as string);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(payload);
      } catch {
        // continue
      }
    }
  }
}
