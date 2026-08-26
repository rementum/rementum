import { Skeleton } from "../components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Skeleton className="h-6 w-48 rounded-full" />
          <Skeleton className="mt-4 h-7 w-36" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
        <div className="flex gap-10">
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-12 w-20" />
        </div>
      </div>
      <Skeleton className="mt-10 h-40 rounded-card" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36 rounded-card" />
        <Skeleton className="h-36 rounded-card" />
        <Skeleton className="h-36 rounded-card" />
      </div>
    </main>
  );
}
