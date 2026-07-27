export type UserRole = "owner" | "contractor" | "engineer" | "architect";

export type StageStatus = "locked" | "in_progress" | "submitted" | "approved" | "rejected";

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

/** The six stages, in construction order, seeded for every new project. */
export const DEFAULT_STAGES: Array<{ key: string; name: string }> = [
  { key: "foundation", name: "Foundation & Excavation" },
  { key: "steel", name: "Steel Reinforcement" },
  { key: "rcc_casting", name: "RCC / Slab Casting" },
  { key: "brickwork", name: "Brickwork" },
  { key: "plastering", name: "Plastering" },
  { key: "finishing", name: "Finishing" },
];
