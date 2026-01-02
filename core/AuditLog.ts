import { Identity, TraceFrame } from "./Context";

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
    console.log(JSON.stringify({
      type: "chainbox_audit",
      ...fullEntry,
    }));
  }

  /**
   * Log a successful execution.
   */
  public static LogSuccess(
    fnName: string,
    identity?: Identity,
    durationMs: number = 0,
    metadata?: Record<string, any>
  ): void {
    this.Log({
      function: fnName,
      identity: identity?.id,
      tenantId: (identity?.claims as any)?.tenant_id,
      status: "success",
      durationMs,
      metadata,
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
    metadata?: Record<string, any>
  ): void {
    this.Log({
      function: fnName,
      identity: identity?.id,
      tenantId: (identity?.claims as any)?.tenant_id,
      status: "error",
      durationMs,
      error,
      metadata,
    });
  }

  /**
   * Get recent audit logs (for debugging/monitoring).
   */
  public static GetLogs(limit: number = 100): AuditEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Clear all logs (for testing).
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
