import { PickRepository } from "@/components/app/pick-repository";
import { resolveActiveRepository } from "@/lib/data";

export const metadata = { title: "AI Codebase Chat" };

export default async function Page() {
  const repositories = await resolveActiveRepository("chat");
  return <PickRepository title="AI Codebase Chat" repositories={repositories} />;
}
