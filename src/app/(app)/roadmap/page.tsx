import { PickRepository } from "@/components/app/pick-repository";
import { resolveActiveRepository } from "@/lib/data";

export const metadata = { title: "Onboarding Roadmap" };

export default async function Page() {
  const repositories = await resolveActiveRepository("roadmap");
  return <PickRepository title="Onboarding Roadmap" repositories={repositories} />;
}
