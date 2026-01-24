import * as jose from "jose";
import { Identity } from "./Context";
import { Env } from "./Env";

/**
 * Authenticator handles JWT verification and identity extraction.
 */
export class Authenticator {
  private static secret = new TextEncoder().encode(
    Env.get("CHAINBOX_AUTH_SECRET", "default-secret-change-me")
  );

  /**
   * Verifies a JWT token and returns the extracted Identity.
   */
  public static async Authenticate(token?: string): Promise<Identity | undefined> {
    if (!token) return undefined;

    try {
      // Remove 'Bearer ' prefix if present
      const jwt = token.startsWith("Bearer ") ? token.slice(7) : token;
      
      const { payload } = await jose.jwtVerify(jwt, this.secret, {
        algorithms: ["HS256"],
      });

      return {
        id: payload.sub as string,
        email: payload.email as string,
        role: (payload.role as string) || "user",
        token: jwt,
        claims: payload,
      };
    } catch (error) {
      console.error("chainbox: Authentication failed", error);
      throw {
        error: "UNAUTHORIZED",
        message: "Invalid or expired token",
      };
    }
  }
}
