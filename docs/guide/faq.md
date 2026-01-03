# FAQ

## Is this a replacement for REST?

Yes, for most internal API needs. If you need to expose a public API for
third-party developers, REST or GraphQL might still be appropriate (though you
can wrap Chainbox capabilities in REST endpoints easily).

## How does it handle file uploads?

Currently, we recommend handling file uploads separately via direct storage
uploads (e.g., Supabase Storage, S3 presigned URLs) and passing the file key to
the capability.

## Can I use it with React/Vue/Svelte?

Yes! Chainbox client is framework-agnostic. It's just a promise-based function.
