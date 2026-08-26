import { Skeleton } from "../../../components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-5 h-7 w-96 max-w-full" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-card bg-surface p-6 shadow-card sm:p-8">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-3 h-4 w-11/12" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="mt-3 h-4 w-2/3" />
          <Skeleton className="mt-6 h-32 w-full rounded-control" />
        </div>
        <Skeleton className="h-64 rounded-card" />
      </div>
    </main>
  );
}
