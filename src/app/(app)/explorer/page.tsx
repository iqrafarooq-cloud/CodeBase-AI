import { PickRepository } from "@/components/app/pick-repository";
import { resolveActiveRepository } from "@/lib/data";

export const metadata = { title: "Code Explorer" };

export default async function Page() {
  const repositories = await resolveActiveRepository("explorer");
  return <PickRepository title="Code Explorer" repositories={repositories} />;
}
