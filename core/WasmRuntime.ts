import { Ctx } from "./Context";
import { ExecutionRuntime } from "./Executor";
import { TextDecoder, TextEncoder } from "util";

/*
 * WasmRuntime handles execution of WebAssembly modules.
 * Injects Chainbox Ctx capabilities as imports into the WASM instance.
 */
export class WasmRuntime implements ExecutionRuntime {
  public async run(handler: any, ctx: Ctx): Promise<any> {
    const wasmCode = handler as Buffer;
    let instance: WebAssembly.Instance;
    
    // Create new memory for this instance (16MB start, expandable)
    const memory = new WebAssembly.Memory({ initial: 256 });
    
    // Host imports for the WASM module
    const imports = {
      env: {
        memory,
        chainbox_call: (namePtr: number, nameLen: number, inputPtr: number, inputLen: number) => {
             const mem = new Uint8Array(memory.buffer);
             const name = new TextDecoder().decode(mem.subarray(namePtr, namePtr + nameLen));
             const inputStr = new TextDecoder().decode(mem.subarray(inputPtr, inputPtr + inputLen));
             let input: any;
             try { input = JSON.parse(inputStr); } catch { input = inputStr; }

             console.log(`[WASM] Calling Host Function: ${name}`, input);
             
             // In a blocking WASM environment, we can't await this directly without unwinding stack.
             // We'll throw to indicate that for now, only pure logic is supported in this runtime.
             throw new Error("WASM_SYNC_CALL_NOT_SUPPORTED: proper stack switching required");
        },
        chainbox_log: (ptr: number, len: number) => {
            const mem = new Uint8Array(memory.buffer);
            const msg = new TextDecoder().decode(mem.subarray(ptr, ptr + len));
            console.log(`[WASM-LOG] ${msg}`);
        },
        // Legacy support if needed
        chainbox_get_input_len: () => {
             const inputStr = JSON.stringify(ctx.input);
             return new TextEncoder().encode(inputStr).length;
        }
      }
    };

    const instantiatedSource: any = await WebAssembly.instantiate(wasmCode, imports);
    instance = instantiatedSource.instance;
    const exports: any = instance.exports;

    if (typeof exports.main !== "function") {
      throw new Error("WASM_MISSING_MAIN_EXPORT");
    }

    // 1. Marshall Input: Write input JSON string to WASM memory
    // ABI Requirement: Module MUST export 'alloc(size: i32) -> i32'
    const inputStr = JSON.stringify(ctx.input);
    const encodedInput = new TextEncoder().encode(inputStr);
    
    if (typeof exports.alloc !== "function") {
      throw new Error("WASM_ABI_VIOLATION: Module must export 'alloc(size: number) -> number' for memory management.");
    }
    
    const inputPtr = exports.alloc(encodedInput.length + 1); // +1 for null terminator if needed by guest
    const mem = new Uint8Array(memory.buffer);
    mem.set(encodedInput, inputPtr);
    mem[inputPtr + encodedInput.length] = 0; // Null-terminate input just in case

    // 2. Execute Main: main(ptr, len) -> result_ptr
    const resultPtr = exports.main(inputPtr, encodedInput.length);
    
    // 3. Marshall Output: Read result string from memory
    // ABI Assumption: Result is a null-terminated UTF-8 string
    const resultBuffer = new Uint8Array(memory.buffer);
    let resultLen = 0;
    
    // Safety check: Prevent infinite loop if memory is corrupted or string is not terminated
    const maxLen = resultBuffer.length - resultPtr;
    while (resultLen < maxLen && resultBuffer[resultPtr + resultLen] !== 0) {
      resultLen++;
    }
    
    const resultStr = new TextDecoder().decode(resultBuffer.subarray(resultPtr, resultPtr + resultLen));
    
    let result: any;
    try {
      result = JSON.parse(resultStr);
    } catch {
      // If result is not JSON, return it as a raw string.
      // This is not a mock, but a valid return type for scalar functions.
      result = resultStr; 
    }

    // Optional: free memory if dealloc exists
    if (typeof exports.dealloc === "function") {
      exports.dealloc(inputPtr, encodedInput.length + 1);
      // We don't free result here as we don't own it from the host side usually
    }

    return { executed: "wasm", result }; 
  }
}
