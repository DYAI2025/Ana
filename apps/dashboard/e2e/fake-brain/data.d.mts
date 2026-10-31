import type { BrainProjection } from "../../src/features/brain/types";

export function baseProjection(): BrainProjection;
export function mirrored(projection: BrainProjection): BrainProjection;
