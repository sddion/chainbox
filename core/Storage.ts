// Safe imports for Node.js only
const fs = (typeof process !== 'undefined' && process.versions && process.versions.node) ? require('fs') : undefined;
const path = (typeof process !== 'undefined' && process.versions && process.versions.node) ? require('path') : undefined;
import { Telemetry } from "./Telemetry";

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
 * FileSystemStorage provides persistent local storage.
 * Replaces InMemoryStorage for real data persistence.
 */
export class FileSystemStorage implements StorageAdapter {
  private scope: string;
  private baseDir: string;

  constructor(scope: string) {
    this.scope = scope;
    if (path && fs) {
        this.baseDir = path.join(process.cwd(), ".chainbox", "data", scope);
        if (!fs.existsSync(this.baseDir)) {
          fs.mkdirSync(this.baseDir, { recursive: true });
        }
    } else {
        // Fallback or error? For now, we allow it but methods will fail or be no-ops.
        // In a real app, FileSystemStorage shouldn't be used in RN.
        this.baseDir = "";
    }
  }

  public async get(key: string): Promise<any> {
    const startTime = Date.now();
    const filePath = this.getPath(key);
    if (!fs || !fs.existsSync(filePath)) {
      Telemetry.IncrementCounter("chainbox_storage_miss_total", { scope: this.scope, operation: "get" });
      return null;
    }
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const result = JSON.parse(data);
      Telemetry.IncrementCounter("chainbox_storage_hits_total", { scope: this.scope, operation: "get" });
      Telemetry.RecordHistogram("chainbox_storage_latency_ms", Date.now() - startTime, { scope: this.scope, operation: "get" });
      return result;
    } catch {
      return null;
    }
  }

  public async set(key: string, value: any): Promise<void> {
    if (!fs) return;
    const startTime = Date.now();
    const filePath = this.getPath(key);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    Telemetry.IncrementCounter("chainbox_storage_ops_total", { scope: this.scope, operation: "set" });
    Telemetry.RecordHistogram("chainbox_storage_latency_ms", Date.now() - startTime, { scope: this.scope, operation: "set" });
  }

  public async delete(key: string): Promise<void> {
    if (!fs) return;
    const filePath = this.getPath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  public async list(prefix: string = ""): Promise<string[]> {
    if (!fs || !fs.existsSync(this.baseDir)) return [];
    const files: string[] = fs.readdirSync(this.baseDir);
    return files
      .map((f: string) => decodeURIComponent(f))
      .filter((k: string) => k.startsWith(prefix));
  }

  private getPath(key: string): string {
    return path.join(this.baseDir, encodeURIComponent(key));
  }
}

/**
 * MemoryStorage for non-persistent environments (like React Native / Client).
 */
export class MemoryStorage implements StorageAdapter {
  private store = new Map<string, any>();

  constructor(private scope: string) {}

  public async get(key: string): Promise<any> {
      const val = this.store.get(key);
      if (val) {
          Telemetry.IncrementCounter("chainbox_storage_hits_total", { scope: this.scope, operation: "get" });
          return JSON.parse(val); // Clone
      }
      Telemetry.IncrementCounter("chainbox_storage_miss_total", { scope: this.scope, operation: "get" });
      return null;
  }

  public async set(key: string, value: any): Promise<void> {
      this.store.set(key, JSON.stringify(value));
      Telemetry.IncrementCounter("chainbox_storage_ops_total", { scope: this.scope, operation: "set" });
  }

  public async delete(key: string): Promise<void> {
      this.store.delete(key);
  }

  public async list(prefix: string = ""): Promise<string[]> {
      return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
  }
}
