---
layout: home

hero:
  name: "Chainbox"
  text: "Execution-first, no APIs."
  tagline: Stop Building APIs. Start Chaining Capabilities.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/sddion/chainbox

features:
  - title: No More REST/GraphQL
    details: Call your backend functions directly from the client. No need to define API endpoints, serializers, or resolvers.
  - title: Capability Chaining
    details: Securely chain capabilities in a single execution context. Pass data between functions without round trips.
  - title: Type-Safe Execution
    details: Full TypeScript support. Get autocomplete and type checking for your backend functions on the client.
---

## Why Chainbox?

### The Problem: API Complexity

Building APIs is tedious. You have to define routes, controllers, DTOs,
serializers, and then keep them in sync with your client. GraphQL solves some of
this but introduces its own complexity with resolvers and schemas.

### The Solution: Execution-First

Chainbox lets you expose "capabilities" (functions) securely to the client. The
client constructs a chain of executions and sends it to the server. The server
executes them in order, passing the context along.

## How it Works

### Simple

Client -> Request -> Execution -> Response

### Technical

Chainbox uses a mechanism similar to JSON-RPC but with a focus on "Chaining".
You can invoke `user.create` and then pipe its output to
`email.sendVerification` in a single request.

### Code Example

**The Old Way (Fetch/REST)**

```javascript
// Client
const res = await fetch("/api/users", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
const user = await res.json();
```

**The Chainbox Way**

```javascript
// Client
import { Call } from "@sddion/chainbox/client";

const user = await Call("user.create", { email, password });
```

## Security by Design

Chainbox is secure by default. It uses an Execution Context (`ctx`) principle.
Every execution runs within a context that determines what capabilities are
available. You can mount specific capabilities for unauthenticated users vs
authenticated users.

## Supabase Compatibility

Chainbox plays nicely with Supabase. Use the `ctx.db` adapter to interact with
your Supabase database directly within your capabilities, respecting RLS
policies.
