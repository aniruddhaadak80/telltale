name: Pull request
about: Contribute to Telltale
title: ""
labels: []
body:
  - type: markdown
    attributes:
      value: |
        Please read [CONTRIBUTING.md](../blob/main/CONTRIBUTING.md) first. The rule
        that matters: a number you publish has to be one you can show the arithmetic
        for.

  - type: textarea
    id: what
    attributes:
      label: What this changes
    validations:
      required: true

  - type: textarea
    id: evidence
    attributes:
      label: How you know it is correct
      description: The test that fails on the old code and passes on the new one.
    validations:
      required: true

  - type: checkboxes
    id: gate
    attributes:
      label: Gate
      options:
        - label: `npm run check` passes.
        - label: `npm run test:e2e` passes.
        - label: If a weight, lexicon, normalisation rule or derivation changed, `ENGINE_VERSION` is bumped and the method page is updated.
        - label: If an engine changed, `npm run bench:prepare` and `npm run bench:parity` were run.
