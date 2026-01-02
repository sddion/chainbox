import { Http } from "../transport/Http";
import { Identity } from "../core/Context";

/**
 * Public call function for developers.
 * Automatically chooses between Local and Http transport.
 */
export async function Call(
  fnName: string, 
  input?: any, 
  options: { identity?: Identity; headers?: Record<string, string> } = {}
): Promise<any> {
  const isServer = typeof window === "undefined";

  if (isServer) {
    const { Local } = await import("../transport/Local");
    return await Local.Call(fnName, input, options.identity);
  } else {
    return await Http.Call(fnName, input, options.headers);
  }
}
