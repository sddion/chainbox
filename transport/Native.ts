import { Executor } from "../core/Executor";
import { Identity } from "../core/Context";

/**
 * Native transport executes functions directly using the Executor.
 * It ensures the Executor is initialized with environment-specific config if needed.
 */
export class Native {
  // Flag to track if we've initialized the Executor for this session
  private static initialized = false;

  public static async Call(fnName: string, input: any, identity?: Identity): Promise<any> {
    if (!this.initialized) {
        // In Native/Client mode, we might not have filesystem config loading.
        // We rely on defaults or explicit injection if we add that API later.
        await Executor.ensureInitialized(); 
        this.initialized = true;
    }

    // ForceLocal = true allows us to bypass some planning overhead if we know we are the "server"
    return await Executor.Execute(fnName, input, [], identity, undefined, "local");
  }
}
