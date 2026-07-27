export type UserRole = "owner" | "contractor" | "engineer" | "architect";

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
  /** Null (or "foundation") means the normal, default start — no request involved. */
  requested_start_stage_key: string | null;
  /** True while a non-designer's chosen starting stage awaits designer/admin approval. */
  start_stage_pending: boolean;
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
}

export interface ChecklistStage {
  id: string;
  project_id: string;
  stage_key: string;
  display_name: string;
  order_index: number;
  status: StageStatus;
  unlocked_at: string | null;
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
 * The six stages, in construction order, seeded for every new project.
 * Names here must exactly match the display_name values seeded by
 * create_default_stages_and_checkpoints in schema.sql — this is the one
 * place the frontend needs to know the stage list up front (e.g. to build
 * a "start from this stage" picker before any checklist_stages rows exist).
 */
export const DEFAULT_STAGES: Array<{ key: string; name: string }> = [
  { key: "foundation", name: "Foundation" },
  { key: "steel", name: "Steel Reinforcement" },
  { key: "rcc_casting", name: "RCC Casting" },
  { key: "brickwork", name: "Brickwork" },
  { key: "plastering", name: "Plastering" },
  { key: "finishing", name: "Finishing" },
];
