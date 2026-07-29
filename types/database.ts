export type UserRole = "owner" | "contractor" | "engineer" | "architect" | "student";

export type StageStatus =
  | "locked"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "not_tracked";

export type CheckpointStatus = "pending" | "pass" | "fail" | "flagged";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  license_number: string | null;
  license_verified: boolean;
  is_platform_admin: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  location: string | null;
  created_by: string;
  created_at: string;
  fee_exempt: boolean;
  /** Null (or "layout") means the normal, default start — no request involved. */
  requested_start_stage_key: string | null;
  /** True while a non-designer's chosen starting stage awaits designer/admin approval. */
  start_stage_pending: boolean;
  /** How many floors above Ground already existed when this project started tracking — 0 for an ordinary new build. */
  requested_floor_count: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role_on_project: UserRole;
  is_project_designer: boolean;
  added_at: string;
}

export interface SignOff {
  id: string;
  stage_id: string;
  user_id: string;
  role_at_signing: UserRole;
  confirmation_text: string;
  signed_at: string;
}

export interface CheckpointEvidence {
  id: string;
  checkpoint_id: string;
  storage_path: string;
  uploaded_by: string;
  uploaded_at: string;
  device_metadata: Record<string, unknown> | null;
  ai_precheck_status: "pending" | "done" | "failed";
  ai_precheck_note: string | null;
}

export interface ChecklistStage {
  id: string;
  project_id: string;
  stage_key: string;
  display_name: string;
  order_index: number;
  status: StageStatus;
  unlocked_at: string | null;
  /** Null = Foundation (once, whole building). 0 = Ground Floor, 1 = 1st Floor, and so on. */
  floor_number: number | null;
}

export interface Checkpoint {
  id: string;
  stage_id: string;
  description: string;
  standard_reference: string | null;
  status: CheckpointStatus;
  order_index: number;
}

/**
 * Foundation stages, in order — happens once, whole building, seeded at
 * project creation. Keys and names here must exactly match
 * create_default_stages_and_checkpoints in schema.sql.
 */
export const FOUNDATION_STAGES: Array<{ key: string; name: string }> = [
  { key: "layout", name: "Site Layout" },
  { key: "excavation_soil", name: "Excavation & Soil Test" },
  { key: "pcc", name: "PCC" },
  { key: "footing_steel", name: "Footing Steel" },
  { key: "footing_concrete", name: "Footing Concreting" },
  { key: "plinth_beam_steel", name: "Plinth Beam Steel" },
  { key: "plinth_beam_concrete", name: "Plinth Beam Concreting" },
];

/**
 * The five stages that repeat for every floor (Ground, 1st, 2nd, ...).
 * Keys here are the un-prefixed form — the real stage_key in the database
 * is "f{floor_number}_{key}" (e.g. "f0_column", "f1_slab_beam"), matching
 * add_next_floor and create_default_stages_and_checkpoints in schema.sql.
 */
export const FLOOR_STAGE_TEMPLATE: Array<{ key: string; name: string }> = [
  { key: "column", name: "Column" },
  { key: "brickwork", name: "Brickwork" },
  { key: "lintel", name: "Lintel" },
  { key: "slab_beam", name: "Slab & Beam" },
  { key: "plastering", name: "Plastering" },
];

/** "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", ... */
export function floorLabel(floorNumber: number): string {
  if (floorNumber === 0) return "Ground Floor";
  if (floorNumber === 1) return "1st Floor";
  if (floorNumber === 2) return "2nd Floor";
  if (floorNumber === 3) return "3rd Floor";
  return `${floorNumber}th Floor`;
}

/**
 * Builds the full ordered list of stage keys + display labels for a brand
 * new project, given how many floors already exist (0 = just Ground Floor,
 * the ordinary default). Used for the "start from this stage" picker at
 * project creation — this is the one place the frontend needs to know the
 * stage list before any checklist_stages rows exist yet.
 */
export function buildStartingStageOptions(
  existingFloorCount: number
): Array<{ key: string; label: string }> {
  const options = FOUNDATION_STAGES.map((s) => ({ key: s.key, label: s.name }));

  for (let floor = 0; floor <= existingFloorCount; floor++) {
    const label = floorLabel(floor);
    for (const s of FLOOR_STAGE_TEMPLATE) {
      options.push({ key: `f${floor}_${s.key}`, label: `${label} — ${s.name}` });
    }
  }

  return options;
}
