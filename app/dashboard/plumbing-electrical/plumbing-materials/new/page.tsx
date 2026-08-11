import { QuickNewProjectForm } from "@/components/quick-new-project-form";

export default function NewPlumbingMaterialsProjectPage() {
  return (
    <QuickNewProjectForm
      backHref="/dashboard/plumbing-electrical/plumbing-materials"
      backLabel="Plumbing Materials"
      continueBasePath="/dashboard/plumbing-electrical/plumbing-materials"
    />
  );
}
