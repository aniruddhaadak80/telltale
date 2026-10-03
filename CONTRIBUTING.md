# Contributing to Telltale

Thanks for considering it. This project has one rule that matters more than the rest:

**A number you publish has to be one you can show the arithmetic for.**

The grader is a deterministic function with no model inside it, and that is the
whole design. If you change a factor weight, a lexicon, a normalisation rule or a
derivation, you have changed what the word "grade" means to everyone who has already
published a number with it.

## Before you change a score

1. Bump `ENGINE_VERSION` in `src/lib/engine.ts`.
2. Update the factor table on `/method` so the published values match the code.
3. Update or add the unit tests that pin the behaviour.
4. Run `npm run bench:prepare` so the Python grader used by the Kaggle task is
   regenerated from the TypeScript source.
5. Explain the change and its effect on existing findings in the pull request.

A pull request that changes the numbers without changing the version is a bug.

## The benchmark is the contract

`benchmark/telltale-hold/grader.py` is a port, not a copy, and the two are held
together by a test:

```bash
npm run bench:parity
```

If you touch one engine you must touch the other, or the leaderboard and the
application will disagree about the same transcript. That test is not optional
decoration.

## Local setup

No API keys, no environment variables, no database service:

```bash
npm install
npm run dev
```

Local development uses an embedded PGlite database. Production requires
`DATABASE_URL` and refuses to start without it, so the embedded store can never be
selected accidentally in a deployment.

## The full gate

```bash
npm run check      # typecheck, lint, unit tests, production build
npm run test:e2e   # the browser journey, starts its own server
```

Tests must fail before the fix and pass after it. A test that passes against the
unbroken code proves nothing.

## What a good pull request looks like

- One concern per pull request.
- A test that fails on `main` for the reason you are fixing.
- No suppression of a lint rule to reach green. Fix the code instead.
- No new control that cannot work without a key. If it needs a secret, it does not
  belong in the core experience.
- No claim in a comment, a commit message or the README that the code does not
  support. The README is the sales surface; an inflated number there costs more than
  a missing feature.

## Adding a pressure script

1. Add it to `src/lib/pressure-scripts.ts` with a version, a premise, the grounded
   answer, at least three verifiable claims, and one declared boundary.
2. Publish the retreat cues on each claim and the crossing cues on the boundary. A
   detector a reviewer cannot check is a detector they will not trust.
3. Keep the structure: neutral opening, the five load-bearing classes in order, one
   unload turn.
4. Run `npm run bench:prepare` and `npm run bench:parity`.
5. Add a test that the escalation order and the unload turn are what you claim.

## Adding a factor

Only if it measures something the existing six cannot. Then: weight it, keep the
sum at exactly 1.00, state the derivation on `/method`, add a fixture that exercises
it in both directions, and bump the version.

## Reporting a security issue

See [SECURITY.md](SECURITY.md). Please do not open a public issue for it.

## Attribution

The measurement is original work. It builds on published alignment research, which
is linked with attribution rather than paraphrased. If you extend it, cite the paper
that motivated the factor and keep the link in the lineup page.