import { z } from "zod";

export const ID_RE = /^[a-z]{2,4}-[a-z0-9-]{3,80}$/;
export const UNKNOWN = "UNKNOWN";
export const NOTE_TYPES = ["source", "concept", "method", "tool", "preference", "observation", "workshop", "topic", "question"] as const;
export const STATUSES = ["SOURCE", "CONFIRMED", "DERIVED", "CANDIDATE", "SUPERSEDED"] as const;
export const RELATION_TYPES = ["supports", "contradicts", "updates", "relates_to", "derived_from", "part_of", "answers", "supersedes"] as const;
export const HUMANS = ["ana", "ben", "vince"] as const;
export const SOURCE_KINDS = ["drive_doc", "drive_sheet", "drive_file", "confluence_page", "local_file", "url"] as const;

export type NoteType = (typeof NOTE_TYPES)[number];
export type Status = (typeof STATUSES)[number];
export type RelationType = (typeof RELATION_TYPES)[number];
export type Human = (typeof HUMANS)[number];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
export const zId = z.string().regex(ID_RE, "invalid id");
export const zIso = z.string().refine((s) => ISO_RE.test(s) && !Number.isNaN(Date.parse(s)), "invalid ISO timestamp");
export const zIsoOrUnknown = z.union([zIso, z.literal(UNKNOWN)]);
export const zActor = z.union([z.enum(HUMANS), z.string().regex(/^agent:[a-z0-9][a-z0-9._-]{0,40}$/), z.literal(UNKNOWN)]);

export const zSourceRef = z.object({ source: zId, locator: z.string().min(1).max(500) }).strict();
export const zRelation = z.object({ type: z.enum(RELATION_TYPES), target: zId, by: zActor, at: zIsoOrUnknown }).strict();
export const zProvenance = z
  .object({
    method: z.enum(["seed", "manual", "mcp", "agent-derived"]),
    actor: zActor,
    at: zIsoOrUnknown,
    note: z.string().max(1000).optional(),
  })
  .strict();
export const zSourceBlock = z
  .object({
    kind: z.enum(SOURCE_KINDS),
    locator: z.string().min(1).max(2000),
    original_title: z.string().min(1).max(500),
    access: z.enum(["restricted", "internal", "public"]),
    data_class: z.enum(["G0", "G1", "G2", "G3"]),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
    retrieved_at: zIsoOrUnknown.optional(),
  })
  .strict();

export const zFrontmatter = z
  .object({
    ana_brain: z.literal(1),
    id: zId,
    title: z.string().min(1).max(300),
    type: z.enum(NOTE_TYPES),
    status: z.enum(STATUSES),
    created: zIsoOrUnknown,
    updated: zIsoOrUnknown,
    created_by: zActor,
    topics: z.array(zId).default([]),
    workshops: z.array(zId).default([]),
    source_refs: z.array(zSourceRef).default([]),
    relations: z.array(zRelation).default([]),
    superseded_by: zId.nullable().default(null),
    provenance: zProvenance,
    source: zSourceBlock.optional(),
  })
  .strict()
  .superRefine((fm, ctx) => {
    if ((fm.status === "SOURCE") !== (fm.type === "source"))
      ctx.addIssue({ code: "custom", path: ["status"], message: "status SOURCE is required for and only allowed on type source" });
    if (fm.status === "SUPERSEDED" && !fm.superseded_by)
      ctx.addIssue({ code: "custom", path: ["superseded_by"], message: "SUPERSEDED requires superseded_by" });
    if (fm.type === "source" && !fm.source) ctx.addIssue({ code: "custom", path: ["source"], message: "type source requires a source block" });
    if (fm.type !== "source" && fm.source) ctx.addIssue({ code: "custom", path: ["source"], message: "source block only allowed on type source" });
  });

export type Frontmatter = z.infer<typeof zFrontmatter>;
export type Relation = z.infer<typeof zRelation>;
export type SourceBlock = z.infer<typeof zSourceBlock>;

export const FOLDER_BY_TYPE: Record<NoteType, string> = {
  source: "sources",
  workshop: "workshops",
  topic: "topics",
  question: "questions",
  concept: "knowledge",
  method: "knowledge",
  tool: "knowledge",
  preference: "knowledge",
  observation: "knowledge",
};

export const isHuman = (actor: string): actor is Human => (HUMANS as readonly string[]).includes(actor);
