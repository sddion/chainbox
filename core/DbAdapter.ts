import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Identity } from "./Context";

/**
 * Supabase Adapter with RLS forwarding.
 */
export class DbAdapter {
  private client?: SupabaseClient;

  constructor(private credentials: { url?: string; secretKey?: string }) {
    if (credentials.url && credentials.secretKey) {
      if (!credentials.secretKey.startsWith("ey")) {
        console.warn("chainbox: Supabase secret key does not look like a JWT. Ensure you are using the SERVICE_ROLE key.");
      }
      this.client = createClient(credentials.url, credentials.secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
  }

  /**
   * Returns a scoped Supabase client for the given identity.
   */
  public from(table: string, identity?: Identity) {
    if (!this.client) {
      throw new Error("DB_NOT_CONFIGURED: Supabase credentials are missing. Set CHAINBOX_SUPABASE_URL and CHAINBOX_SUPABASE_SECRET_KEY.");
    }

    // If an identity with a token is provided, create a scoped client to enforce RLS
    if (identity && identity.token) {
      const scopedClient = createClient(this.credentials.url!, this.credentials.secretKey!, {
        global: {
          headers: {
            Authorization: `Bearer ${identity.token}`
          }
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      return scopedClient.from(table);
    }

    return this.client.from(table);
  }

  /**
   * Raw client access for system operations.
   */
  public getClient() {
    return this.client;
  }
}
