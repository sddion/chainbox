# Security Model

Chainbox is secure by capability exposure.

## Authorization

You can check `ctx.identity` to determine if a user is authenticated.

```typescript
import { Ctx } from "@sddion/chainbox";

export default async function update(input: any, ctx: Ctx) {
  if (!ctx.identity) throw new Error("Unauthorized");

  // Update logic...
}
```

## Error Handling

Errors thrown in capabilities are safely serialized to the client. You can
define safe error types to avoid leaking internal implementation details.

```typescript
// Server
if (!valid) throw new SafeError("Invalid Input");

// Client
try {
  await call("...");
} catch (e) {
  console.log(e.message); // "Invalid Input"
}
```
