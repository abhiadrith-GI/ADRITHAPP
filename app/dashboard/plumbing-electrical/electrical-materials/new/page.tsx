import { QuickNewProjectForm } from "@/components/quick-new-project-form";

export default function NewElectricalMaterialsProjectPage() {
  return (
    <QuickNewProjectForm
      toolKey="electrical_materials"
      backHref="/dashboard/plumbing-electrical/electrical-materials"
      backLabel="Electrical Materials"
      continueBasePath="/dashboard/plumbing-electrical/electrical-materials"
    />
  );
}
