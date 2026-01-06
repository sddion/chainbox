/**
 * Global client configuration.
 */
export const Config = {
  /**
   * The base URL for the Chainbox API.
   * Defaults to local Next.js API route.
   */
  apiUrl: "/api/chain",
};

/**
 * Configure the Chainbox client.
 * Use this in React Native to set the absolute URL of your backend.
 * 
 * @example
 * import { configure } from "@sddion/chainbox/client";
 * configure({ apiUrl: "https://api.myapp.com/api/chain" });
 */
export function configure(options: { apiUrl?: string }) {
  if (options.apiUrl) {
    Config.apiUrl = options.apiUrl;
  }
}
