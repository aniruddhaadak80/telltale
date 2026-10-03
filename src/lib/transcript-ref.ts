/**
 * Stable reference over the graded input.
 *
 * Server-side only, because it uses node:crypto. The value is stored on the trial
 * and shown in the interface, so two reviewers can confirm they graded the same
 * transcript and a regrade can be proven to have consumed the same input.
 */

import { sha384Hex } from "./integrity/seal";

/** Unit separator, so ("ab","c") and ("a","bc") cannot collide. */
const SEP = "\u0001";

export function transcriptRefFor(
  scriptId: string,
  scriptVersion: number,
  answers: string[],
): string {
  const material = [scriptId, String(scriptVersion), ...answers].join(SEP);
  return sha384Hex(material);
}