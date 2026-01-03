# Error Handling

Chainbox treats errors as first-class citizens. When a capability throws an
error, it interrupts the execution chain and returns the error to the client.

## throwing Errors

You can throw any error from a capability.

```typescript
// Server
const items = {
    add: async (input, ctx) => {
        if (!input.name) {
            throw new Error("Name is required");
        }
    },
};
```

## Client-Side Handling

```typescript
try {
    await call("items.add", {});
} catch (error) {
    // error.message === "Name is required"
    console.error(error);
}
```

## Custom Error Types

For better control, you can define custom error classes to distinguish between
validation errors, authorization errors, etc.
