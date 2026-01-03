# Supabase Adapter

Chainbox includes a built-in adapter for Supabase.

## Setup

Set the following environment variables:

- `CHAINBOX_SUPABASE_URL`
- `CHAINBOX_SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)

Chainbox will automatically initialize `ctx.db` with these credentials.

## Usage in Capabilities

```typescript
import { Ctx } from "@sddion/chainbox";

export default async function list(input: any, ctx: Ctx) {
    const { data, error } = await ctx.db
        .from("todos")
        .select("*");

    if (error) throw error;
    return data;
}
```

## Row Level Security (RLS)

token if available, or use `supabase.auth.setSession` within the context
creation logic.
