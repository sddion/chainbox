import { Executor } from "../core/Executor";
import { Identity } from "../core/Context";

/**
 * Local transport executes functions directly.
 */
export class Local {
  public static async Call(fnName: string, input: any, identity?: Identity): Promise<any> {
    return await Executor.Execute(fnName, input, [], identity);
  }
}
