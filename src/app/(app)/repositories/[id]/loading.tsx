import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      <div className="space-y-6 lg:col-span-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-64" />
      </div>
      <div className="space-y-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
