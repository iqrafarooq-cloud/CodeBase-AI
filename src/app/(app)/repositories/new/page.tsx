import { PageHeader } from "@/components/ui/primitives";
import { ConnectRepository } from "@/components/repo/connect-repository";

export const metadata = { title: "Connect repository" };

export default function NewRepositoryPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Connect a repository" description="CodeBase AI reads the source, never executes it, and skips secrets, binaries and build output." />
      <ConnectRepository />
    </div>
  );
}
