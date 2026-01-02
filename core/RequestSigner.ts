import crypto from "crypto";

/**
 * RequestSigner provides HMAC-SHA256 signing for mesh communication.
 * 
 * Features:
 * - Signs payloads with shared secret
 * - Includes timestamp to prevent replay attacks
 * - Validates signatures on receiving end
 * 
 * Configuration:
 * - CHAINBOX_MESH_SECRET: Shared secret for signing (required for signing)
 * - CHAINBOX_MESH_SIGNATURE_TTL_MS: Maximum age of signature (default: 60000)
 */
export class RequestSigner {
  private static secret = process.env.CHAINBOX_MESH_SECRET;
  private static ttlMs = parseInt(process.env.CHAINBOX_MESH_SIGNATURE_TTL_MS || "60000");

  /**
   * Check if signing is enabled (secret is configured).
   */
  public static IsEnabled(): boolean {
    return !!this.secret;
  }

  /**
   * Sign a payload with timestamp.
   */
  public static Sign(payload: any): { signature: string; timestamp: number } {
    if (!this.secret) {
      return { signature: "", timestamp: Date.now() };
    }

    const timestamp = Date.now();
    const message = `${timestamp}:${JSON.stringify(payload)}`;
    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(message)
      .digest("hex");

    return { signature, timestamp };
  }

  /**
   * Verify a signature.
   */
  public static Verify(
    payload: any,
    signature: string,
    timestamp: number
  ): { valid: boolean; error?: string } {
    if (!this.secret) {
      return { valid: true }; // No secret = no verification required
    }

    // Check timestamp freshness
    const age = Date.now() - timestamp;
    if (age > this.ttlMs) {
      return { valid: false, error: "SIGNATURE_EXPIRED" };
    }

    if (age < 0) {
      return { valid: false, error: "SIGNATURE_FROM_FUTURE" };
    }

    // Verify signature
    const message = `${timestamp}:${JSON.stringify(payload)}`;
    const expectedSignature = crypto
      .createHmac("sha256", this.secret)
      .update(message)
      .digest("hex");

    // Constant-time comparison to prevent timing attacks
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    return valid ? { valid: true } : { valid: false, error: "INVALID_SIGNATURE" };
  }

  /**
   * Create signed headers for mesh requests.
   */
  public static CreateHeaders(payload: any): Record<string, string> {
    if (!this.secret) {
      return {};
    }

    const { signature, timestamp } = this.Sign(payload);
    return {
      "X-Chainbox-Signature": signature,
      "X-Chainbox-Timestamp": timestamp.toString(),
    };
  }

  /**
   * Verify headers from mesh request.
   */
  public static VerifyHeaders(
    payload: any,
    headers: Record<string, string>
  ): { valid: boolean; error?: string } {
    if (!this.secret) {
      return { valid: true };
    }

    const signature = headers["x-chainbox-signature"] || headers["X-Chainbox-Signature"];
    const timestampStr = headers["x-chainbox-timestamp"] || headers["X-Chainbox-Timestamp"];

    if (!signature || !timestampStr) {
      return { valid: false, error: "MISSING_SIGNATURE" };
    }

    const timestamp = parseInt(timestampStr);
    if (isNaN(timestamp)) {
      return { valid: false, error: "INVALID_TIMESTAMP" };
    }

    return this.Verify(payload, signature, timestamp);
  }
}
