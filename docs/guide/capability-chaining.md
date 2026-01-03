# Server-Side Composition

You can compose capabilities using `ctx.call` or `ctx.parallel` within your
functions. This allows you to build complex workflows from simple, reusable
capabilities.

## Sequential Composition

Call another capability and await its result.

```typescript
export default async function create(input, ctx: Ctx) {
  const user = await ctx.call("db.createUser", input);
  await ctx.call("email.sendWelcome", { email: user.email });
  return user;
}
```

## Parallel Execution

Run multiple capabilities concurrently.

```typescript
const [users, posts] = await ctx.parallel([
  { fn: "user.list" },
  { fn: "post.list" },
]);
```
