import { QuickNewProjectForm } from "@/components/quick-new-project-form";

export default function NewLandscapingProjectPage() {
  return (
    <QuickNewProjectForm
      toolKey="landscaping_gardening"
      backHref="/dashboard/landscaping-gardening"
      backLabel="Landscaping & Gardening"
      continueBasePath="/dashboard/landscaping-gardening"
    />
  );
}
