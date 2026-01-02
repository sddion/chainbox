/**
 * Http transport calls functions via the internal API route.
 */
export class Http {
  public static async Call(fnName: string, input: any, headers: Record<string, string> = {}): Promise<any> {
    const response = await fetch("/api/chain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ fn: fnName, input }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw errorData;
    }

    return await response.json();
  }
}
