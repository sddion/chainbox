import { Config } from "../client/Config";

/**
 * Http transport calls functions via the internal API route.
 */
export class Http {
  public static async Call(fnName: string, input: any, headers: Record<string, string> = {}): Promise<any> {
    const finalHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (Config.token) {
      finalHeaders["Authorization"] = `Bearer ${Config.token}`;
    }

    const response = await fetch(Config.apiUrl, {
      method: "POST",
      headers: finalHeaders,
      body: JSON.stringify({ fn: fnName, input }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "HTTP_ERROR", message: response.statusText }));
      throw errorData;
    }

    return await response.json();
  }
}
