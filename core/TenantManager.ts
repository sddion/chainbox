import { Identity } from "./Context";
import { FileSystemStorage } from "./Storage";

/**
 * TenantConfig defines per-tenant resource limits and routing.
 */
export type TenantConfig = {
  tenantId: string;
  maxCallsPerMinute: number;
  maxCallDepth: number;
  timeoutMs: number;
  nodePool?: string;  // Dedicated node pool for this tenant
  priority: number;   // Higher = higher priority
};

/**
 * TenantQuotaState tracks current usage for a tenant.
 */
type TenantQuotaState = {
  callsThisMinute: number;
  lastMinuteStart: number;
  totalCalls: number;
  totalErrors: number;
};

/**
 * Default tenant configuration from environment.
 */
const DEFAULT_TENANT_CONFIG: TenantConfig = {
  tenantId: "default",
  maxCallsPerMinute: parseInt(process.env.CHAINBOX_TENANT_DEFAULT_CALLS_PER_MIN || "1000"),
  maxCallDepth: parseInt(process.env.CHAINBOX_TENANT_DEFAULT_MAX_DEPTH || "20"),
  timeoutMs: parseInt(process.env.CHAINBOX_TENANT_DEFAULT_TIMEOUT_MS || "30000"),
  priority: 1,
};

/**
 * TenantManager handles multi-tenant isolation, quotas, and routing.
 * 
 * Configuration:
 * - CHAINBOX_TENANT_CONFIGS: JSON array of tenant configs
 * - CHAINBOX_TENANT_DEFAULT_*: Default limits for unknown tenants
 */
export class TenantManager {
  private static tenantConfigs: Map<string, TenantConfig> = new Map();
  private static tenantQuotas = new FileSystemStorage("tenant_quotas");
  private static initialized = false;

  /**
   * Initialize from environment (lazy, once).
   */
  private static Init() {
    if (this.initialized) return;
    this.initialized = true;

    // Parse CHAINBOX_TENANT_CONFIGS: '[{"tenantId":"acme","maxCallsPerMinute":5000,...}]'
    const configsEnv = process.env.CHAINBOX_TENANT_CONFIGS;
    if (configsEnv) {
      try {
        const configs: TenantConfig[] = JSON.parse(configsEnv);
        for (const config of configs) {
          this.tenantConfigs.set(config.tenantId, { ...DEFAULT_TENANT_CONFIG, ...config });
        }
      } catch {
        console.error("chainbox: Failed to parse CHAINBOX_TENANT_CONFIGS");
      }
    }
  }

  /**
   * Extract tenant ID from identity claims.
   */
  public static GetTenantId(identity?: Identity): string {
    if (!identity) return "anonymous";
    const claims = identity.claims as Record<string, any> | undefined;
    return claims?.tenant_id || claims?.org_id || "default";
  }

  /**
   * Get configuration for a tenant.
   */
  public static GetConfig(tenantId: string): TenantConfig {
    this.Init();
    return this.tenantConfigs.get(tenantId) || { ...DEFAULT_TENANT_CONFIG, tenantId };
  }

  /**
   * Get or initialize quota state for a tenant.
   */
  private static async GetQuotaState(tenantId: string): Promise<TenantQuotaState> {
    const now = Date.now();
    let state: TenantQuotaState = await this.tenantQuotas.get(tenantId);

    if (!state) {
      state = { callsThisMinute: 0, lastMinuteStart: now, totalCalls: 0, totalErrors: 0 };
    }

    // Reset if minute has passed
    if (now - state.lastMinuteStart > 60000) {
      state.callsThisMinute = 0;
      state.lastMinuteStart = now;
    }

    return state;
  }

  /**
   * Check if a tenant is allowed to make a call (quota enforcement).
   */
  public static async IsAllowed(identity?: Identity): Promise<boolean> {
    this.Init();
    const tenantId = this.GetTenantId(identity);
    const config = this.GetConfig(tenantId);
    const state = await this.GetQuotaState(tenantId);

    return state.callsThisMinute < config.maxCallsPerMinute;
  }

  /**
   * Record a call for quota tracking.
   */
  public static async RecordCall(identity?: Identity, success: boolean = true) {
    const tenantId = this.GetTenantId(identity);
    const state = await this.GetQuotaState(tenantId);

    state.callsThisMinute++;
    state.totalCalls++;
    if (!success) state.totalErrors++;
    await this.tenantQuotas.set(tenantId, state);
  }

  /**
   * Enforce tenant quota, throwing if exceeded.
   */
  public static async Enforce(identity?: Identity): Promise<void> {
    if (!await this.IsAllowed(identity)) {
      const tenantId = this.GetTenantId(identity);
      const config = this.GetConfig(tenantId);
      throw {
        error: "TENANT_QUOTA_EXCEEDED",
        tenantId,
        limit: config.maxCallsPerMinute,
        message: `Tenant ${tenantId} exceeded quota of ${config.maxCallsPerMinute} calls/minute`,
      };
    }
  }

  /**
   * Get effective execution limits for a tenant.
   */
  public static GetLimits(identity?: Identity): { maxDepth: number; timeoutMs: number } {
    const config = this.GetConfig(this.GetTenantId(identity));
    return {
      maxDepth: config.maxCallDepth,
      timeoutMs: config.timeoutMs,
    };
  }

  /**
   * Get the preferred node pool for a tenant (for routing).
   */
  public static GetNodePool(identity?: Identity): string | undefined {
    const config = this.GetConfig(this.GetTenantId(identity));
    return config.nodePool;
  }

  /**
   * Get quota usage statistics for a tenant.
   */
  public static async GetStats(tenantId: string): Promise<TenantQuotaState & { config: TenantConfig }> {
    const config = this.GetConfig(tenantId);
    const state = await this.GetQuotaState(tenantId);
    return { ...state, config };
  }

  /**
   * Get all tenant statistics (for monitoring).
   */
  public static async GetAllStats(): Promise<Record<string, TenantQuotaState & { config: TenantConfig }>> {
    this.Init();
    const result: Record<string, any> = {};
    const tenantIds = await this.tenantQuotas.list();
    for (const tenantId of tenantIds) {
      result[tenantId] = await this.GetStats(tenantId);
    }
    return result;
  }
}
