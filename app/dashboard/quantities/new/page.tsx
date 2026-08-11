import { QuickNewProjectForm } from "@/components/quick-new-project-form";

export default function NewQuantityProjectPage() {
  return (
    <QuickNewProjectForm
      backHref="/dashboard/quantities"
      backLabel="Quantities"
      continueBasePath="/dashboard/quantities"
    />
  );
}
