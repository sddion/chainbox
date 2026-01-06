import { Identity, TraceFrame } from "./Context";
import fs from "fs";
import path from "path";

/**
 * AuditEntry represents a single audit log entry.
 */
export type AuditEntry = {
  timestamp: string;
  function: string;
  identity?: string;
  tenantId?: string;
  status: "success" | "error";
  durationMs: number;
  error?: string;
  metadata?: Record<string, any>;
  traceId?: string;
  trace?: TraceFrame;
};

/**
 * AuditLog provides structured audit logging for compliance and debugging.
 * 
 * Configuration via environment:
 * - CHAINBOX_AUDIT_ENABLED: Enable/disable audit logging (default: true)
 * - CHAINBOX_AUDIT_LEVEL: Log level filter (all, errors, none)
 */
export class AuditLog {
  private static enabled = process.env.CHAINBOX_AUDIT_ENABLED !== "false";
  private static level = process.env.CHAINBOX_AUDIT_LEVEL || "all";
  private static logs: AuditEntry[] = [];
  private static maxLogs = 1000;
  private static logFile = path.join(process.cwd(), ".chainbox", "trace.log");

  // Ensure log directory exists
  private static ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    }
  }

  /**
   * Log an execution event.
   */
  public static Log(entry: Omit<AuditEntry, "timestamp">): void {
    if (!this.enabled) return;
    if (this.level === "none") return;
    if (this.level === "errors" && entry.status === "success") return;

    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    // Circular buffer - remove oldest if at capacity
    if (this.logs.length >= this.maxLogs) {
      this.logs.shift();
    }
    this.logs.push(fullEntry);

    // Structured JSON output to stdout
    const jsonLog = JSON.stringify({
      type: "chainbox_audit",
      ...fullEntry,
    });
    console.log(jsonLog);

    // Persist to local file for CLI inspection
    this.ensureLogDir();
    fs.appendFile(this.logFile, jsonLog + "\n", () => {});

  }

  /**
   * Log a successful execution.
   */
  public static LogSuccess(
    fnName: string,
    identity?: Identity,
    durationMs: number = 0,
    metadata?: Record<string, any>,
    traceId?: string,
    trace?: TraceFrame
  ): void {
    this.Log({
      function: fnName,
      identity: identity?.id,
      tenantId: (identity?.claims as any)?.tenant_id,
      status: "success",
      durationMs,
      metadata,
      traceId,
      trace
    });
  }

  /**
   * Log a failed execution.
   */
  public static LogError(
    fnName: string,
    error: string,
    identity?: Identity,
    durationMs: number = 0,
    metadata?: Record<string, any>,
    traceId?: string,
    trace?: TraceFrame
  ): void {
    this.Log({
      function: fnName,
      identity: identity?.id,
      tenantId: (identity?.claims as any)?.tenant_id,
      status: "error",
      durationMs,
      error,
      metadata,
      traceId,
      trace
    });
  }

  /**
   * Get recent audit logs (for debugging/monitoring).
   */
  public static GetLogs(limit: number = 100): AuditEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Clear all logs.
   */
  public static Clear(): void {
    this.logs = [];
  }

  /**
   * Get logs filtered by function.
   */
  public static GetByFunction(fnName: string, limit: number = 100): AuditEntry[] {
    return this.logs.filter(l => l.function === fnName).slice(-limit);
  }

  /**
   * Get logs filtered by identity.
   */
  public static GetByIdentity(identityId: string, limit: number = 100): AuditEntry[] {
    return this.logs.filter(l => l.identity === identityId).slice(-limit);
  }

  /**
   * Get error rate for a function over recent logs.
   */
  public static GetErrorRate(fnName: string): number {
    const fnLogs = this.logs.filter(l => l.function === fnName);
    if (fnLogs.length === 0) return 0;
    const errors = fnLogs.filter(l => l.status === "error").length;
    return errors / fnLogs.length;
  }
}
