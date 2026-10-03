/**
 * A dated, hand-checked snapshot of the Kaggle catalogue, used only when the live
 * endpoint cannot be reached.
 *
 * These refs were observed from the live public endpoint and are shipped so the
 * page still renders on a build machine with no network. The API labels them
 * `status: "fallback"` and the interface says so; nothing here is presented as
 * current. Observed 2026-10-03.
 */

import type { AlignmentPaper, KaggleModel } from "../types";

export const SEALED_FALLBACK_OBSERVED_AT = "2026-10-03T09:20:00.000Z";

export const SEALED_KAGGLE_FALLBACK: readonly KaggleModel[] = [
  {
    ref: "google/gemma",
    title: "Gemma",
    provider: "google",
    parametersB: null,
    license: "Gemma",
    taskTypes: ["pyTorch"],
    lastUpdated: null,
  },
  {
    ref: "google/gemma-3",
    title: "Gemma 3",
    provider: "google",
    parametersB: null,
    license: "Gemma",
    taskTypes: ["pyTorch"],
    lastUpdated: null,
  },
  {
    ref: "google/gemma-4",
    title: "Gemma 4",
    provider: "google",
    parametersB: null,
    license: "Apache 2.0",
    taskTypes: ["transformers"],
    lastUpdated: null,
  },
  {
    ref: "metaresearch/llama-3.1",
    title: "Llama 3.1",
    provider: "metaresearch",
    parametersB: null,
    license: "Llama 3.1 Community License",
    taskTypes: ["pyTorch"],
    lastUpdated: null,
  },
  {
    ref: "deepseek-ai/deepseek-r1",
    title: "DeepSeek R1",
    provider: "deepseek-ai",
    parametersB: null,
    license: "MIT",
    taskTypes: ["transformers"],
    lastUpdated: null,
  },
  {
    ref: "qwen-lm/qwen-3",
    title: "Qwen 3",
    provider: "qwen-lm",
    parametersB: null,
    license: "Apache 2.0",
    taskTypes: ["transformers"],
    lastUpdated: null,
  },
  {
    ref: "qwen-lm/qwq-32b-preview",
    title: "QwQ 32B Preview",
    provider: "qwen-lm",
    parametersB: null,
    license: "Apache 2.0",
    taskTypes: ["transformers"],
    lastUpdated: null,
  },
  {
    ref: "mistral-ai/mistral-small-24b",
    title: "Mistral Small 24B",
    provider: "mistral-ai",
    parametersB: null,
    license: "Apache 2.0",
    taskTypes: ["transformers"],
    lastUpdated: null,
  },
  {
    ref: "keras/mistral",
    title: "Mistra, Keras",
    provider: "keras",
    parametersB: null,
    license: "Apache 2.0",
    taskTypes: ["keras"],
    lastUpdated: null,
  },
];
/**
 * The arXiv snapshot used when the live feed cannot be reached.
 *
 * Observed from the live Atom endpoint on 2026-10-03. These are real papers and
 * the API labels them `status: "fallback"`; the interface shows the observed date
 * so nobody reads them as today's literature.
 *
 * They are also the reason the grader is shaped the way it is. Three of them
 * document confounds in sycophancy measurement, and `/method` states each one
 * against the factor it affects.
 */
export const SEALED_PAPER_FALLBACK: readonly AlignmentPaper[] = [
  {
    arxivId: "2609.33672",
    title: "Reset Is Not Recovery: Evaluating Recoverability from False Conversational Context via Sycophancy",
    summary:
      "Treats returning to a correct position after a false conversational context as distinct from never leaving it, and measures recoverability directly.",
    published: "2026-09-27T00:00:00.000Z",
    updated: "2026-09-27T00:00:00.000Z",
    authors: ["Adi Shnaidman"],
    categories: ["cs.CL", "cs.AI"],
    absUrl: "https://arxiv.org/abs/2609.33672",
  },
  {
    arxivId: "2609.39863",
    title: "FIGS: Evaluating Multi-Turn Sycophancy Without Penalizing Empathy",
    summary:
      "A multi-turn evaluation that separates agreement with the user from respectful, empathic phrasing, so a warm answer is not scored as a capitulation.",
    published: "2026-09-30T00:00:00.000Z",
    updated: "2026-09-30T00:00:00.000Z",
    authors: ["Sidharth Pulipaka", "Ruta Binkyte", "Ivaxi Sheth", "Sahar Abdelnabi"],
    categories: ["cs.CL", "cs.AI"],
    absUrl: "https://arxiv.org/abs/2609.39863",
  },
  {
    arxivId: "2609.32867",
    title: "Are You Sure You're Sure? Two Confounds in a Sycophancy Benchmark",
    summary:
      "Identifies two measurement confounds in an existing sycophancy benchmark and shows they move the reported score independently of model behaviour.",
    published: "2026-09-26T00:00:00.000Z",
    updated: "2026-09-26T00:00:00.000Z",
    authors: ["Atharv Gupta", "Akshat Jindal", "Lavanya Nigam", "Aryan Sood"],
    categories: ["cs.CL", "cs.AI"],
    absUrl: "https://arxiv.org/abs/2609.32867",
  },
  {
    arxivId: "2609.37616",
    title:
      "Authority Bias in Language Models: Source Deference and User Agreement Are Not Interchangeable",
    summary:
      "Separates deference to an authoritative source from agreement with the user, and shows the two move independently.",
    published: "2026-09-29T00:00:00.000Z",
    updated: "2026-09-29T00:00:00.000Z",
    authors: ["Abhinav Rajeev Kumar", "Paras Chopra"],
    categories: ["cs.CL", "cs.AI"],
    absUrl: "https://arxiv.org/abs/2609.37616",
  },
  {
    arxivId: "2609.35544",
    title:
      "Less Sycophancy, Stronger Refusal? Lessons for AI Safety from Mechanistic Interpretability",
    summary:
      "Examines whether reducing measured sycophancy changes refusal behaviour, which are not the same objective.",
    published: "2026-09-28T00:00:00.000Z",
    updated: "2026-09-28T00:00:00.000Z",
    authors: ["Xu Wang", "Difan Zou", "Xuansheng Wu"],
    categories: ["cs.CL", "cs.LG"],
    absUrl: "https://arxiv.org/abs/2609.35544",
  },
  {
    arxivId: "2609.38296",
    title: "AI Agents are Vulnerable to Radicalization",
    summary:
      "Shows multi-agent systems can be steered into a shifted behavioural regime through interaction rather than instruction.",
    published: "2026-09-29T00:00:00.000Z",
    updated: "2026-09-29T00:00:00.000Z",
    authors: ["Ozgur Can Seckin", "Shalmoli Ghosh", "Alessandro Flammini"],
    categories: ["cs.CL", "cs.MA"],
    absUrl: "https://arxiv.org/abs/2609.38296",
  },
];
