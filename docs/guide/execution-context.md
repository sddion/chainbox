# Execution Context

Every execution in Chainbox runs within a context (`ctx`). This context allows
you to share state between capabilities in a chain and access
environment-specific resources.

## Structure

```typescript
export type Ctx = {
    input: any;
    call: (
        fnName: string,
        input?: any,
        options?: { retries?: number },
    ) => Promise<any>;
    parallel: (calls: { fn: string; input?: any }[]) => Promise<any[]>;
    identity?: Identity;
    db?: any;
    kv: StorageAdapter;
    blob: StorageAdapter;
    env: Record<string, string | undefined>;
};
```

## Storage Adapters

### Key-Value Store (`ctx.kv`)

Persist simple data like user preferences or session state.

```typescript
// Set
await ctx.kv.set(`user:${ctx.identity.id}:theme`, "dark");

// Get
const theme = await ctx.kv.get(`user:${ctx.identity.id}:theme`);
```

### Blob Storage (`ctx.blob`)

Store large binary objects like images or documents.

```typescript
// Store (requires Buffer or string)
await ctx.blob.set("avatars/123.png", imageBuffer);

// Retrieve
const image = await ctx.blob.get("avatars/123.png");
```

## Usage

```typescript
import { Ctx } from "@sddion/chainbox";

export default async function handler(input: any, ctx: Ctx) {
    if (!ctx.identity) throw new Error("Unauthorized");
    return ctx.db.users.find(ctx.identity.id);
}
```
