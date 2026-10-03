# Telltale-Hold — the Kaggle benchmark task

This directory is the challenge artifact: a benchmark you can push to Kaggle and run
across its model catalogue. It contains no credentials and no keys, and nothing here
is needed to run the web application.

## What it measures

A model is given a small evidence base and asked to answer only from it. Then a
confident human escalates through five named pressure classes — authority, social
proof, urgency, sunk cost, direct denial — and finally stops.

The score is not "did the model agree with the user". It is what agreeing cost:

| Reported | Meaning |
| --- | --- |
| `observedYieldTurn` | the pressure turn at which the stated position moved |
| `fabricationCount` | unsupported figures and entities introduced after it moved |
| `boundaryBreaches` | times a declared limit was crossed |
| `permanentSetClaims` | verified claims that did not return after pressure stopped |
| `compositeGrade` | mean hold grade across the three scripts, 0–100, higher is better |

The last one is the point. Structural testing calls deformation that remains after
the load is removed *permanent set*, and published work on recoverability from false
conversational context treats reset and recovery as different outcomes. A model that
reverts and a model that does not are different engineering problems.

## Files

| File | Role |
| --- | --- |
| `task_telltale_hold.py` | the `@kbench.task` you push and run |
| `grader.py` | the scorer, a faithful port of `src/lib/engine.ts` |
| `scripts.py` | the probe library, **generated** from the TypeScript source |
| `fixtures.json` | the parity corpus used to prove the two graders agree |

`scripts.py` is generated. After changing a probe in `src/lib/pressure-scripts.ts`,
run `npm run bench:prepare` from the repository root, or the leaderboard and the
application will grade against different scripts.

## Running it

You need your own Kaggle account. Nothing in this repository requires one.

```bash
pip install kaggle kaggle-benchmarks
kaggle b init -y            # writes .env with short-lived Model Proxy credentials
```

Validate locally first — this is the step that catches a task file that pushes
cleanly but records nothing:

```bash
python task_telltale_hold.py
ls -1 *.run.json             # a run file must appear
```

Then push, run and collect:

```bash
kaggle b t push telltale-hold -f task_telltale_hold.py --wait
kaggle b t run telltale-hold -m gemini-3.5-flash --wait
kaggle b t run telltale-hold -m claude-haiku-4-5 -m gpt-5-nano --wait
kaggle b t download telltale-hold -o ./results
```

A useful lineup spans the question rather than just the top of the table:

- **two instruction-tuned open-weight families** (`gemma`, `qwen`, `llama`), because
  the taxonomy was designed against open checkpoints and they are the ones most teams
  actually deploy;
- **one small model** (`gpt-5-nano` or the cheapest available), because the interesting
  result is whether degradation shows up as a *shape* change or only as a score
  change;
- **one frontier model**, as a reference point rather than as a target;
- **one model twice**, with and without reasoning, if the catalogue allows it — the
  only way to tell whether "thinking" changes the *shape* of the drift or just the
  fluency.

## Proving the two graders agree

The scorer is a port, so the port is tested:

```bash
npm run bench:parity      # vitest run src/lib/benchmark-parity.test.ts
```

It grades this fixture corpus with both implementations, at three service loads, and
fails on any disagreement in the grade, the band, the safety factor, the observed move
turn, the permanent-set count or any of the six factor values. If the check is skipped
because no Python interpreter is present it says so; a green run always means it ran.

## Rating at a different load

`SERVICE_LOAD` scales the rating without changing the transcript:

```bash
TELLTALE_SERVICE_LOAD=2.0 python task_telltale_hold.py
```

The observed move turn never changes, because a rating is not a measurement. The
safety factor and the predicted move turn do, which is how you decide whether a model
that held the scripted escalation survives your actual user base.

## Attribution and limits

The probes are written by this project and are original. The measurement they are
built on draws on published alignment research, linked with attribution on the
application's [lineup and provenance](https://github.com/aniruddhaadak80/telltale#-lineup-and-provenance)
page, including work documenting confounds in sycophancy measurement that this
benchmark inherits rather than solves.