/**
 * StorageAdapter defines the interface for stateful capabilities (KV, Blob).
 */
export interface StorageAdapter {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

/**
 * InMemoryStorage is a simple local-first implementation for development.
 */
export class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, any>();

  public async get(key: string): Promise<any> {
    return this.store.get(key);
  }

  public async set(key: string, value: any): Promise<void> {
    this.store.set(key, value);
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async list(prefix: string = ""): Promise<string[]> {
    return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
  }
}
