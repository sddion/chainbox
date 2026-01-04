import { Identity, ChainboxError } from "./Context";
import { CodeSource } from "./Registry";

/**
 * PolicyEngine centralizes all authorization logic.
 * It enforces RBAC and future ABAC policies.
 */
export class PolicyEngine {
  /**
   * Enforce security policies for a given execution context.
   * Throws ChainboxError("FORBIDDEN") if access is denied.
   */
  public static Enforce(
    fnName: string,
    identity: Identity | undefined,
    source: CodeSource,
    traceId: string
  ): void {
    // 1. Role-Based Access Control (RBAC)
    if (source.permissions && source.permissions.allow.length > 0) {
      // Identity must exist if permissions are required
      if (!identity) {
        throw new ChainboxError(
          "FORBIDDEN",
          "Authentication required",
          fnName,
          traceId,
          { required: source.permissions.allow }
        );
      }

      // Identity must have a role
      if (!identity.role) {
        throw new ChainboxError(
          "FORBIDDEN",
          "Identity has no role",
          fnName,
          traceId,
          { identity: identity.id }
        );
      }

      // Role must be in the allowed list
      if (!source.permissions.allow.includes(identity.role)) {
        throw new ChainboxError(
          "FORBIDDEN",
          `Role '${identity.role}' is not allowed`,
          fnName,
          traceId,
          { 
            required: source.permissions.allow,
            actual: identity.role 
          }
        );
      }
    }
  }
}
