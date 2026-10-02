import { PickRepository } from "@/components/app/pick-repository";
import { resolveActiveRepository } from "@/lib/data";

export const metadata = { title: "Architecture Explorer" };

export default async function Page() {
  const repositories = await resolveActiveRepository("architecture");
  return <PickRepository title="Architecture Explorer" repositories={repositories} />;
}
