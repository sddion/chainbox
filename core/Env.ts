import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load .env files if they exist
const envFiles = [".env", ".env.local", ".env.development", ".env.production"];
for (const file of envFiles) {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export class Env {
  public static DetectSupabaseConfig(): { url: string; key: string } {
    const env = process.env;
    let url = "";
    let key = "";

    // 1. Scanning Heuristics for URL
    // Look for keys ending in _URL that contain 'supabase.co'
    for (const [k, v] of Object.entries(env)) {
      if (!v) continue;
      
      const keyUpper = k.toUpperCase();
      
      // Exact matches (Optimization)
      if (keyUpper === "SUPABASE_URL" || keyUpper === "CHAINBOX_SUPABASE_URL" || keyUpper === "NEXT_PUBLIC_SUPABASE_URL") {
        url = v;
        break;
      }

      // Heuristic match
      if (keyUpper.endsWith("_URL") && v.includes("supabase.co")) {
        url = v;
      }
    }

    // 2. Scanning Heuristics for Key
    // Look for keys ending in _KEY or _ROLE_KEY
    for (const [k, v] of Object.entries(env)) {
      if (!v) continue;
      
      const keyUpper = k.toUpperCase();

      // Priority: Service Role Key
      if (keyUpper.includes("SERVICE_ROLE_KEY") || keyUpper === "CHAINBOX_SUPABASE_SECRET_KEY") {
        key = v;
        break; 
      }

      // Fallback: Anon Key (if no service key found)
      if (!key && (keyUpper.includes("ANON_KEY") || keyUpper === "SUPABASE_KEY")) {
        key = v;
      }
    }

    // Default Fallback (in case user relies on implicit process.env without loading .env manually)
    if (!url) url = env.CHAINBOX_SUPABASE_URL || env.NEXT_PUBLIC_CHAINBOX_SUPABASE_URL || env.SUPABASE_URL || "";
    if (!key) key = env.CHAINBOX_SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || "";

    return { url, key };
  }

  public static DetectFirebaseConfig(): { projectId: string; clientEmail: string; privateKey: string } {
    const env = process.env;
    let projectId = env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || "";
    let clientEmail = env.FIREBASE_CLIENT_EMAIL || "";
    let privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || "";

    return { projectId, clientEmail, privateKey };
  }
}
