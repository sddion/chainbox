<p align="center">
  <img src="https://github.com/sddion/chainbox/blob/main/docs/public/logo-raw.png?raw=true" alt="Chainbox Logo" width="300" height="150" />
</p>

# Chainbox

**Chainbox** is an **execution-first backend framework** that turns backend
logic into **callable capabilities**.\
It eliminates APIs as an architectural concern by shifting complexity and
security from the network layer into a **deterministic execution fabric**.

> Call logic. Not endpoints.\
> Pay for outcomes. Not attempts.

[**📚 Read the Documentation**](https://sddion.github.io/chainbox/)

---

## Why Chainbox

Modern backends are dominated by APIs — endpoints, routes, retries, gateways,
and glue code. This model leaks complexity, expands attack surface, and charges
developers for failures.

Chainbox takes a different stance:

- **Execution is the primitive**, not transport.
- **Capabilities replace endpoints**, not wrap them.
- **Security is structural**, not procedural.
- **Outcomes matter more than attempts**.

Chainbox does not optimize APIs.\
It removes them from the critical path.

---

## Zero-Surface Security Model

Chainbox is built on **Security by Deletion**.\
By mapping logic to capabilities instead of HTTP endpoints, entire classes of
vulnerabilities are eliminated by design:

- **Public API Attack Surface → GONE**\
  No per-capability URLs. No endpoint scanning. No verb abuse.

- **Credential Leakage → GONE**\
  Frontend never sees database keys or service secrets.\
  All secrets live strictly inside the execution fabric.

- **Transport Injection → GONE**\
  Inputs are data, not commands.\
  No query-string poisoning or header abuse.

- **CORS / CSRF → GONE**\
  Browser-level transport attacks do not apply to a non-endpoint system.

Security is enforced by architecture, not discipline.

---

## Core Concepts

### Logical Functions

Backend logic is defined as **named, stateless, transport-agnostic functions**.

- Location: `src/app/_chain/`
- Mapping:\
  `src/app/_chain/User/Create.ts` → `User.Create`

Logical Functions are the unit of execution and authorization.

---

### Capability Calls

Functions call other functions using `ctx.call()`.

- No `fetch`
- No REST
- No RPC
- No service URLs

This enables **seamless logic chaining** without network boilerplate.

---

### Execution Context (`ctx`)

Every function receives a **controlled execution context** exposing only allowed
capabilities:

- `input` — Call payload (pure data)
- `call(fn, input)` — Invoke another capability
- `parallel()` — Concurrent execution
- `db` — Identity-aware database access (RLS preserved)
- `kv` / `blob` — Stateful primitives
- `env` — Secure environment variables
- `trace` — Deterministic execution tracing

- `trace` — Deterministic execution tracing
- `adapter(name)` — Secure external I/O

There is no ambient access. Everything is explicit.

---

### External I/O (Adapters)

Direct `fetch()` calls are **blocked** by default. To talk to the outside world,
you must use registered adapters.

```ts
// src/app/_chain/Payment/Charge.ts
export default async function (ctx: Ctx) {
  // Safe, monitored, and policy-compliant
  const stripe = ctx.adapter("stripe");
  return await stripe.charges.create(ctx.input);
}
```

---

### Security Policy

Validation happens **before** execution starts.

- **Role-Based**: Functions can enforce strict role requirements.
- **Identity-Aware**: `ctx.identity` is immutably bound to the trace.
- **Zero-Trust**: No identity = No execution (if policy exists).

---

## Usage

### 1. Define a Logical Function

`src/app/_chain/Math/Add.ts`

```ts
import { Ctx } from "@sddion/chainbox";

export default async function (ctx: Ctx) {
  const { a, b } = ctx.input;
  return a + b;
}
```

---

### 2. Call It from Anywhere

The same call works in:

- Server Components
- Client Components
- Nested Chainbox functions
- Mesh nodes

```ts
import { Call } from "@sddion/chainbox/client";

const sum = await Call("Math.Add", { a: 10, b: 20 });
```

No transport decisions. No environment branching. No API routes.

---

## Execution Model (High Level)

1. A capability is called: `Call("User.Create", input)`
2. Chainbox plans execution (local or remote)
3. The function runs inside a controlled runtime
4. Retries, caching, and circuit breakers are handled internally
5. A **single outcome** is produced:

   - `SUCCESS`
   - `FAILURE`
   - `TIMEOUT`
   - `CIRCUIT_OPEN`
   - `FORBIDDEN`

Retries are implementation details. Outcomes are the contract.

---

## Cloud Compatibility

Chainbox is **library-first**, not platform-exclusive.

It runs on:

- AWS (Lambda, Fargate, EKS)
- Google Cloud (Cloud Run, Functions)
- Vercel / self-hosted Node
- Local development

Chainbox does not replace cloud providers. It makes their compute **more
efficient and easier to reason about**.

---

## What Chainbox Is Not

- ❌ Not an API framework
- ❌ Not RPC / REST / GraphQL
- ❌ Not a serverless clone
- ❌ Not a microservices orchestrator

Chainbox is an **execution kernel** for backend logic.

---

## The Principle

> **Chainbox is not how the backend should be optimized. It is how it should
> have worked all along.**

---
