import { getModelShotContext, type ModelFaceReference, type ModelProfile } from "./model-shot";

export interface ModelGeneration {
  profileId: string;
  referenceIds: string[];
  expression: string;
  expressionMode?: ModelProfile["expressionMode"];
}

const EXPRESSIONS = [
  "a gentle closed-mouth smile with relaxed eyes",
  "a warm natural smile with slightly lifted cheeks",
  "a calm, thoughtful expression with a relaxed mouth",
  "a friendly candid smile with a subtle head tilt",
  "a confident relaxed expression with a softly raised brow",
];

function choose<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function selectModelVariation(
  profile: ModelProfile,
  readableReferences: ModelFaceReference[],
  previous?: ModelGeneration,
  random: () => number = Math.random,
): { references: ModelFaceReference[]; generation: ModelGeneration } {
  const last = previous?.profileId === profile.id ? previous : undefined;
  const alternatives = readableReferences.filter((r) => r.id !== last?.referenceIds[0]);
  const lead = choose(alternatives.length ? alternatives : readableReferences, random);
  // Keep the first saved reference as an identity anchor, plus one other angle.
  const anchor = readableReferences[0];
  const remaining = readableReferences.filter((r) => r.id !== lead?.id && r.id !== anchor?.id);
  const support = remaining.length ? choose(remaining, random) : undefined;
  const references = [lead, anchor, support].filter(
    (r, index, all): r is ModelFaceReference => Boolean(r) && all.findIndex((item) => item?.id === r?.id) === index,
  );
  let expression = "a relaxed neutral expression";
  if (profile.expressionMode !== "neutral") {
    expression = profile.expressionMode !== "varied" && lead
      ? "the natural facial expression shown in Image 2"
      : choose(EXPRESSIONS.filter((value) => value !== last?.expression), random);
  }
  return { references, generation: { profileId: profile.id, referenceIds: references.map((r) => r.id), expression, expressionMode: profile.expressionMode ?? "reference" } };
}

export function modelVariationGuidance(generation: ModelGeneration, poseType?: string, viewType?: string): string {
  const context = getModelShotContext(poseType, viewType);
  if (!context.usesFace) return "";
  const count = generation.referenceIds.length;
  const identity = count
    ? `Images 2${count > 1 ? `-${count + 1}` : ""} show the same person. Use all attached face references to preserve identity, facial structure, skin tone, and distinctive features.`
    : "Preserve the selected model's described identity and distinctive features.";
  const framing = context.poseType === "full_body"
    ? "Keep expression subtle at full-body scale. Preserve the complete head-to-toe framing; do not zoom in to show facial detail."
    : "Keep expression natural within the head-through-torso framing, with the garment as the focus; do not turn this into a face close-up.";
  const movement = generation.expressionMode === "neutral"
    ? "Keep the mouth, brow, gaze, and head position relaxed and neutral; do not add a smile, raised brow, or expressive head tilt."
    : "Adapt the expression to the required view rather than copying reference head position or gaze. Keep movement subtle.";
  return `${identity} Expression direction for this generation: use ${generation.expression}. This direction overrides older expression instructions in the preset or profile. ${framing} ${context.viewPrompt} ${movement} Do not change the person's identity or facial anatomy. Explicit user fix requests may override expression only within the structured framing and view. Image 1 remains authoritative for the product. Do not copy clothing, background, lighting, body pose, camera angle, or composition from face references.`;
}
