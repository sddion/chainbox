# Core Concepts

Chainbox flips the traditional API model on its head. Instead of defining
endpoints, you define **Capabilities**.

## Capabilities

Capabilities are pure functions that take an input and an execution context.

```typescript
type Capability = (input: any, ctx: Context) => Promise<any>;
```

## No API Layer

Chainbox uses **File-System Routing** to map capabilities to functions. A file
at `src/app/_chain/user/create.ts` becomes the `user.create` capability.

## The `Call()` Function

The primary way to interact with Chainbox is via the `Call` function.

```typescript
import { Call } from "@sddion/chainbox/client";

// Simple call
await Call("user.create", { name: "Alice" });

// Call with options (e.g., custom headers)
await Call("payment.process", { amount: 100 }, {
    headers: { "Idempotency-Key": "123" },
});
```

It handles:

- Variable serialisation
- Type inference (with TypeScript)
- Error propagation
