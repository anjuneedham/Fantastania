/**
 * Persistence adapter.
 *
 * Everything the game saves goes through this interface, which is why adding
 * cloud saves later is a new adapter and not a rewrite: implement the same four
 * methods against a backend, register it, and SaveSystem is unchanged.
 *
 * Web uses localStorage. Android (Capacitor) uses native Preferences when the
 * plugin is present, which survives WebView data clears that would wipe
 * localStorage.
 */
export interface StorageAdapter {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const PREFIX = 'fantastania:';

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'localStorage';

  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(PREFIX + key, value);
    } catch (err) {
      // Quota or private-browsing failure: surfaced, never fatal. Losing a save
      // should not take the running game down with it.
      console.warn('[storage] write failed', err);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }

  async keys(): Promise<string[]> {
    const out: string[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
      }
    } catch {
      /* ignore */
    }
    return out;
  }
}

/** In-memory fallback so the game still runs where storage is blocked. */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly name = 'memory';
  private map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
  async keys(): Promise<string[]> {
    return Array.from(this.map.keys());
  }
}

interface CapacitorPreferences {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
}

/** Wraps @capacitor/preferences when the native plugin is available. */
export class CapacitorStorageAdapter implements StorageAdapter {
  readonly name = 'capacitor';
  constructor(private readonly prefs: CapacitorPreferences) {}

  async get(key: string): Promise<string | null> {
    const res = await this.prefs.get({ key: PREFIX + key });
    return res.value;
  }
  async set(key: string, value: string): Promise<void> {
    await this.prefs.set({ key: PREFIX + key, value });
  }
  async remove(key: string): Promise<void> {
    await this.prefs.remove({ key: PREFIX + key });
  }
  async keys(): Promise<string[]> {
    const res = await this.prefs.keys();
    return res.keys.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  }
}

/**
 * Picks the best adapter available at runtime. Called once during boot; the
 * result is handed to SaveSystem, which never checks the platform itself.
 */
export async function createStorage(): Promise<StorageAdapter> {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Preferences?: CapacitorPreferences } } })
    .Capacitor;
  const prefs = cap?.Plugins?.Preferences;
  if (prefs) return new CapacitorStorageAdapter(prefs);

  try {
    const probe = '__fantastania_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return new LocalStorageAdapter();
  } catch {
    console.warn('[storage] persistent storage unavailable; progress will not survive reload');
    return new MemoryStorageAdapter();
  }
}
