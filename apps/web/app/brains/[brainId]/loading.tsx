import { Skeleton } from "../../../components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <Skeleton className="size-10 rounded-control" />
          <Skeleton className="mt-4 h-6 w-40" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-6 h-28 rounded-control" />
        </div>
        <div>
          <Skeleton className="h-9 w-full max-w-md" />
          <div className="mt-6 space-y-px overflow-hidden rounded-card">
            <Skeleton className="h-14 rounded-none" />
            <Skeleton className="h-14 rounded-none" />
            <Skeleton className="h-14 rounded-none" />
            <Skeleton className="h-14 rounded-none" />
          </div>
        </div>
      </div>
    </main>
  );
}
