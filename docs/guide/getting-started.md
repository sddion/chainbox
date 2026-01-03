# Getting Started

## Installation

Install `chainbox` in your project.

::: code-group

```bash [npm]
npm install @sddion/chainbox
```

```bash [pnpm]
pnpm add @sddion/chainbox
```

```bash [yarn]
yarn add @sddion/chainbox
```

:::

## Quick Start

### 1. Define Capabilities

Capabilities are defined in `src/app/_chain`.

**File: `src/app/_chain/user/create.ts`**

```typescript
import { Ctx } from "@sddion/chainbox";

export default async function create({ email, password }: any, ctx: Ctx) {
    // Create user logic
    return { id: 1, email };
}
```

### 2. Initialize Chainbox Server

In your Next.js API route (e.g., `src/app/api/chain/route.ts`):

```typescript
import { Executor } from "@sddion/chainbox";

export async function POST(req: Request) {
    const body = await req.json();
    const result = await Executor.Execute(
        body.fn,
        body.input,
        [],
        undefined,
        undefined,
        true,
    );
    return Response.json(result);
}
```

### 3. Call from Client

```typescript
import { Call } from "@sddion/chainbox/client";

const user = await Call("user.create", {
    email: "test@example.com",
    password: "secure",
});
console.log(user);
```
