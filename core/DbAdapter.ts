import { Identity } from "./Context";
import { Telemetry } from "./Telemetry";

/**
 * Interface for database adapters.
 */
export interface IDbAdapter {
  from(name: string, identity?: Identity): any;
  getNative(): any;
}

/**
 * Supabase Adapter with RLS forwarding.
 */
export class SupabaseAdapter implements IDbAdapter {
  private client?: any;

  constructor(private credentials: { url?: string; secretKey?: string }) {
    this.init();
  }

  private init() {
    if (this.credentials.url && this.credentials.secretKey) {
      try {
        const { createClient } = require("@supabase/supabase-js");
        this.client = createClient(this.credentials.url, this.credentials.secretKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      } catch (e) {
        // We warn if the client is actually called but library is missing
      }
    }
  }

  public from(table: string, identity?: Identity) {
    if (!this.client) {
      const { createClient } = require("@supabase/supabase-js");
      this.client = createClient(this.credentials.url!, this.credentials.secretKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    Telemetry.IncrementCounter("chainbox_db_query_total", { table, provider: "supabase" });
    
    if (identity && identity.token) {
        const { createClient } = require("@supabase/supabase-js");
        const scopedClient = createClient(this.credentials.url!, this.credentials.secretKey!, {
            global: { headers: { Authorization: `Bearer ${identity.token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        });
        return scopedClient.from(table);
    }

    return this.client.from(table);
  }

  public getNative() {
    return this.client;
  }
}

/**
 * Firebase Adapter (Firestore/Auth).
 */
export class FirebaseAdapter implements IDbAdapter {
  private admin?: any;
  private db?: any;

  constructor(private config: { projectId: string; clientEmail: string; privateKey: string }) {}

  private ensureClient() {
    if (this.admin) return;
    try {
      const admin = require("firebase-admin");
      this.admin = admin;

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: this.config.projectId,
            clientEmail: this.config.clientEmail,
            privateKey: this.config.privateKey,
          }),
        });
      }
      this.db = admin.firestore();
    } catch (e) {
      throw new Error("FIREBASE_ADMIN_NOT_INSTALLED: Run 'npm install firebase-admin' to use Firebase support.");
    }
  }

  public from(collection: string, identity?: Identity) {
    this.ensureClient();
    Telemetry.IncrementCounter("chainbox_db_query_total", { table: collection, provider: "firebase" });
    return this.db.collection(collection);
  }

  public getNative() {
    this.ensureClient();
    return this.db;
  }
}

/**
 * Factory class for DB Adapters.
 */
export class DbAdapterFactory {
    public static Create(provider: "supabase" | "firebase", config: any): IDbAdapter {
        if (provider === "firebase") {
            return new FirebaseAdapter(config);
        }
        return new SupabaseAdapter(config);
    }
}

