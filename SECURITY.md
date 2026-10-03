# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than in a public issue.

- GitHub private vulnerability reporting: https://github.com/aniruddhaadak80/telltale/security/advisories/new
- Email: the address on the GitHub profile of the maintainer.

Include what an attacker can do, the steps to reproduce it, and the affected version or
commit. You should get an acknowledgement within a few days and a fix or a plan
within two weeks.

## Threat model

Telltale has **no accounts**. Understanding that is the fastest way to understand
where the risk is.

### What is scoped to you

Ownership is an unguessable 128-bit id set in an HTTP-only, SameSite=Lax cookie
before any render, in `src/proxy.ts`. Every read and every write is scoped to it, so:

- one visitor cannot read another visitor's trials;
- clearing cookies starts a new, empty estate, and the old one is unrecoverable;
- the cookie is the only capability. There is no password to leak, and no
  cross-site request can read a response because the cookie is not sent on a
  cross-origin fetch and responses are not readable cross-origin.

### What is deliberately public

- The probe library (`/api/scripts`, `public/`). It is the benchmark; publishing it
  is the point.
- The engine, its weights and its lexicons. A grader you cannot inspect is not
  evidence.
- `public/mcp.json`. It contains an endpoint and tool names, and no credentials.
- Sealed fallback data, which is dated and labelled `fallback` everywhere it appears.

### What is guarded

Destructive operations — tombstoning a trial — require the record's current audit
seal. A seal is only readable by a session that can already read the record, so a
stale link, a prefetch or a crawler cannot delete anything. A mismatched seal returns
`409`; an absent one returns `400`, so a client can tell a retry from a conflict.

### Abuse controls, and their honest limits

Writes are throttled per owner. **On a serverless runtime that counter is per
instance, so it is a hint rather than a guarantee** — it removes accidental bursts
from one client and nothing more. The real, durable limits are:

- bounded list sizes on every query;
- input size caps enforced before the engine or the database sees a string
  (`LIMITS` in `src/lib/validation.ts`);
- database constraints and unique indexes, which hold regardless of the runtime.

A deployment that needs a hard global rate limit should put a rate limiter in front
of the routes. This is documented rather than papered over.

### What the engine will and will not do with your input

Transcripts are user-supplied text that is stored and rendered. It is rendered as
text, never as HTML, so it cannot inject markup. Queries are parameterised
throughout. Errors carry a stable code and a message; stack traces and environment
values are never serialised to a client.

### Deliberate non-goals

Telltale is not hardened for an untrusted, high-volume public submission service.
If you need that, you want a different architecture, not a different configuration.

## Third-party data

Two external sources are read at request time, both keyless and both allowlisted:
the Kaggle public model catalogue and the arXiv Atom API. Neither receives user data.
Responses are size-bounded, time-bounded and retried a bounded number of times.

## Verifying a record

Every trial carries a SHA-384 seal chain over its audit events, with canonical JSON
and a fixed genesis value. Replay it at `/verify?id=<trial-id>`. A pass means the
record has not been edited since it was written, including through a load change, a
decision or a deletion. Deleted trials are tombstoned rather than removed so a chain
stays replayable after the record leaves the estate.