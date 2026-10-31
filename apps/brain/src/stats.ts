import { loadState } from "./index/indexer.js";
import type { Vault } from "./vault/vault.js";

/**
 * `ana-brain stats`: counts only, never note bodies. With every note indexed (`indexed` = `notes`) and `validate` clean,
 * `indexed` and `relations` are the note and relation counts the dashboard's /brain shows: the projection draws the
 * indexed notes and the relations between them.
 */
export function vaultStats(vault: Vault) {
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let relations = 0;
  const notes = vault.all();
  for (const n of notes) {
    byType[n.fm.type] = (byType[n.fm.type] ?? 0) + 1;
    byStatus[n.fm.status] = (byStatus[n.fm.status] ?? 0) + 1;
    relations += n.fm.relations.length;
  }
  const st = loadState(vault.root);
  return {
    notes: notes.length, invalid: vault.loadErrors.length, relations, byType, byStatus,
    indexed: st ? Object.keys(st.notes).length : 0, embed_model: st?.embed_model ?? null, embed_digest: st?.embed_digest ?? null, index_version: st?.index_version ?? null,
  };
}
