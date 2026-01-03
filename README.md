<p align="center">
  <img src="https://github.com/sddion/chainbox/blob/main/docs/public/logo-raw.png?raw=true" alt="Chainbox Logo" width="150" height="150" />
</p>

# Chainbox

**Chainbox** is an execution-first backend framework that turns backend logic
into callable capabilities. It eliminates the need for APIs by shifting security
and complexity from the network layer up to a secure execution fabric.

[**📚 Read the Documentation**](https://sddion.github.io/chainbox/)

## Zero-Surface Security Model

Chainbox is built on the principle of **Security by Deletion**. By mapping logic
to capabilities instead of HTTP endpoints, we structurally eliminate entire
classes of vulnerabilities:

- **Public API Attack Surface → GONE**: No endpoints per capability means no
  URLs to scan, no verbs to exploit, and no API enumeration.
- **Credential Leakage → GONE**: Frontend never touches the database or sees
  service keys; all secrets live strictly within the mesh.
- **Transport Injection → GONE**: Input is treated as pure data, not commands.
  No URL parameter poisoning or raw query string abuse.
- **CORS / CSRF → GONE**: These browser-level risks simply don't apply to a
  non-endpoint-based system.

## Key Concepts

### Logical Functions

Backend logic defined as named, stateless, and transport-agnostic functions.

- Located in: `src/app/_chain/`
- Mapping: `src/app/_chain/User/Create.ts` → `User.Create`

### Capability Calls

Functions invoke other functions via `ctx.call()`, replacing the need for fetch,
REST, or RPC. This enables seamless backend logic chaining without network
boilerplate.

### Execution Context (`ctx`)

Every function receives a controlled context providing scoped capabilities:

- `input`: The calling payload.
- `call`: Logical function invocation.
- `parallel`: concurrent execution.
- `db`: Database access (identity-aware).
- `kv` / `blob`: Stateful storage.
- `env`: Secure environment variable access.

## Usage

### 1. Define a Function

`src/app/_chain/Math/Add.ts`

```typescript
import { Ctx } from "@sddion/chainbox";

export default async function (input: any, ctx: Ctx) {
  const { a, b } = input;
  return a + b;
}
```

### 2. Call it from Anywhere

Same API works in Server Components, Client Components, and nested Chainbox
functions.

```typescript
import { Call } from "@sddion/chainbox/client";

const sum = await Call("Math.Add", { a: 10, b: 20 });
```

