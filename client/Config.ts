/**
 * Global client configuration.
 */
export const Config = {
  /**
   * The base URL for the Chainbox API.
   * Defaults to local Next.js API route.
   */
  apiUrl: "/api/chain",
  token: undefined as string | undefined,
};

/**
 * Configure the Chainbox client.
 * Use this in React Native or Browser to set the absolute URL and Auth token.
 * 
 * @example
 * import { configure } from "@sddion/chainbox/client";
 * configure({ 
 *   apiUrl: "https://api.myapp.com/api/chain",
 *   token: "my-jwt-token"
 * });
 */
export function configure(options: { apiUrl?: string; token?: string }) {
  if (options.apiUrl) {
    Config.apiUrl = options.apiUrl;
  }
  if (options.token) {
    Config.token = options.token;
  }
}
