import { QuickNewProjectForm } from "@/components/quick-new-project-form";

export default function NewQuantityProjectPage() {
  return (
    <QuickNewProjectForm
      toolKey="quantities"
      backHref="/dashboard/quantities"
      backLabel="Quantities"
      continueBasePath="/dashboard/quantities"
    />
  );
}
