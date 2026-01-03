# Capability Reference

## Client

### `Call()`

The primary entry point for executing capabilities from the client side.

**Signature**

```typescript
function Call(
  fnName: string,
  input?: any,
  options?: CallOptions,
): Promise<any>;
```

**Parameters**

| Parameter | Type          | Required | Description                                                                       |
| :-------- | :------------ | :------- | :-------------------------------------------------------------------------------- |
| `fnName`  | `string`      | Yes      | The dot-notation path to the capability (e.g., `'user.create'`).                  |
| `input`   | `any`         | No       | The input data payload passed to the capability capability as the first argument. |
| `options` | `CallOptions` | No       | Configuration options for the execution.                                          |

**Type: `CallOptions`**

```typescript
type CallOptions = {
  identity?: Identity; // Impersonate identity (server-side only)
  headers?: Record<string, string>; // Custom headers for HTTP transport
};
```

**Returns**

- `Promise<T>`: Resolves with the return value of the capability.
- Throws an error object if execution fails (e.g.,
  `{ error: "VALIDATION_ERROR", message: "..." }`).

**Example**

```typescript
import { Call } from "@sddion/chainbox/client";

const result = await Call("user.profile", { id: "123" }, {
  headers: { "X-Custom-Trace": "debug" },
});
```

---

## Server

### `Ctx` (Execution Context)

The execution context passed to every capability as the second argument. It
provides access to the request identity, environment, and storage.

```typescript
type Ctx = {
  input: any;
  identity?: Identity;
  env: Record<string, string | undefined>;

  // Storage
  kv: StorageAdapter;
  blob: StorageAdapter;
  db?: any; // Auto-injected if configured

  // Composition
  call: (fnName: string, input?: any) => Promise<any>;
  parallel: (calls: { fn: string; input?: any }[]) => Promise<any[]>;
};
```

#### `ctx.identity`

Represents the authenticated user or service.

```typescript
type Identity = {
  id: string;
  email?: string;
  role?: string;
  token?: string;
  claims?: Record<string, any>;
};
```

#### `ctx.kv` & `ctx.blob` (`StorageAdapter`)

Both `kv` and `blob` implement the `StorageAdapter` interface for persistent
storage.

| Method   | Signature                                     | Description                     |
| :------- | :-------------------------------------------- | :------------------------------ |
| `get`    | `get(key: string): Promise<any>`              | Retrieve a value/object.        |
| `set`    | `set(key: string, value: any): Promise<void>` | Store a value/object.           |
| `delete` | `delete(key: string): Promise<void>`          | Remove a key.                   |
| `list`   | `list(prefix?: string): Promise<string[]>`    | List keys starting with prefix. |

**Example Usage**

```typescript
// Store user preference
await ctx.kv.set(`pref:${ctx.identity.id}`, { theme: "dark" });

// Retrieve
const pref = await ctx.kv.get(`pref:${ctx.identity.id}`);
```

#### `ctx.env`

Access environment variables safely.

```typescript
const apiKey = ctx.env.STRIPE_SECRET_KEY;
```

#### `ctx.call` & `ctx.parallel`

Used for [Server-Side Composition](/guide/capability-chaining).

```typescript
const user = await ctx.call("user.get", { id: 1 });
```
