import fs from "fs";
import path from "path";
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
    this.baseDir = path.join(process.cwd(), ".chainbox", "data", scope);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async get(key: string): Promise<any> {
    const startTime = Date.now();
    const filePath = this.getPath(key);
    if (!fs.existsSync(filePath)) {
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
    const startTime = Date.now();
    const filePath = this.getPath(key);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    Telemetry.IncrementCounter("chainbox_storage_ops_total", { scope: this.scope, operation: "set" });
    Telemetry.RecordHistogram("chainbox_storage_latency_ms", Date.now() - startTime, { scope: this.scope, operation: "set" });
  }

  public async delete(key: string): Promise<void> {
    const filePath = this.getPath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  public async list(prefix: string = ""): Promise<string[]> {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir)
      .map(f => decodeURIComponent(f))
      .filter(k => k.startsWith(prefix));
  }

  private getPath(key: string): string {
    return path.join(this.baseDir, encodeURIComponent(key));
  }
}
