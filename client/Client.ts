import { Http } from "../transport/Http";
import { Identity } from "../core/Context";

/**
 * Public call function for developers.
 * Automatically chooses between Local and Http transport.
 * 
 * @example
 * // Before: API Route
 * // const res = await fetch("/api/users/create", { method: "POST", body: JSON.stringify(data) });
 * 
 * // After: Chainbox
 * const res = await Call("Users.Create", data);
 */
export async function Call(
  fnName: string, 
  input?: any, 
  options: { identity?: Identity; headers?: Record<string, string> } = {}
): Promise<any> {
  // Robust server-side or Native check
  const isServer = typeof window === "undefined" && typeof process !== "undefined" && !!process.versions?.node;
  // @ts-ignore
  const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

  if (isServer) {
    const { Local } = await import("../transport/Local");
    return await Local.Call(fnName, input, options.identity);
  } else if (isReactNative) {
    const { Native } = await import("../transport/Native");
    return await Native.Call(fnName, input, options.identity);
  } else {
    // Browser or unknown environment -> use HTTP
    return await Http.Call(fnName, input, options.headers);
  }
}
