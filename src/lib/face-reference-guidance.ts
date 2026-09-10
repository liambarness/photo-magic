export const MODEL_CONTINUITY_GUIDANCE =
  "Keep the same hairstyle, hair length, hair color, facial hair, body build, and specified outfit across front, back, and side views. Pants, shoes, and accessories must keep their specified colors and styles. Expression variation must not restyle the model or change the product, lighting, pose, head angle, gaze direction, or framing.";

export function faceReferenceGuidance(
  referenceCount: number,
  viewType?: string,
  random: () => number = Math.random,
): string {
  if (referenceCount < 1) return "";
  const range = referenceCount === 1 ? "Image 2" : `Images 2-${referenceCount + 1}`;
  const parts = [
    `${range} show the same person. Use the complete reference set collectively for facial identity, facial structure, and skin tone.`,
    "Follow the written appearance description for hair. For hairstyle details it does not specify, use Image 2 as the consistent hairstyle reference across views; do not switch hairstyles based on the expression reference.",
    MODEL_CONTINUITY_GUIDANCE,
    "Image 1 is authoritative for the product. The written styling instructions define the rest of the outfit. Do not copy clothing, background, lighting, pose, head angle, gaze direction, or composition from face references.",
  ];
  if (viewType === "back" || viewType === "detail") {
    parts.push("Use the references only for identity and hair continuity in this view. Do not reveal or reposition the face to show an expression; preserve the requested product view and framing.");
  } else {
    const choice = Math.min(referenceCount - 1, Math.floor(random() * referenceCount));
    const cue = referenceCount > 1
      ? `use Image ${choice + 2} only as a cue for a subtle version of its mouth and eye expression`
      : `use ${["a relaxed neutral expression", "a very slight closed-mouth smile", "a soft, relaxed smile"][Math.min(2, Math.floor(random() * 3))]}`;
    parts.push(`Expression variation: only if a face is naturally visible in the requested view and crop, ${cue}. This replaces generic instructions not to copy expressions from references; explicit expression requests in the notes or regeneration feedback take priority. All references still define the same identity. Do not exaggerate the expression, rotate the head toward a reference angle, or widen the crop to show the face.`);
    if (viewType === "side") parts.push("Keep the face in the requested side profile while adapting the expression.");
    if (!viewType || viewType === "unknown") parts.push("If the source shows a rear or detail view, omit expression variation and preserve that view.");
  }
  return parts.join(" ");
}
