import { cookies, headers } from "next/headers";
import { Skeleton } from "../../components/ui/skeleton";
import { getDictionary } from "../../lib/i18n/get-dictionary";
import { resolveLocale } from "../../lib/i18n/locales";

export default async function DashboardLoading() {
  const locale = resolveLocale(
    (await cookies()).get("rementum_locale")?.value,
    (await headers()).get("accept-language"),
  );
  return (
    <main
      aria-label={getDictionary(locale).dashboard.loading}
      aria-busy="true"
      className="mx-auto w-full max-w-[1360px] px-5 pt-8 pb-16 sm:px-8 lg:pt-10"
    >
      <div className="pb-7">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-9 w-32" />
        <Skeleton className="mt-3 h-4 w-64 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="surface-panel">
          <div className="border-line border-b p-6">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="mt-3 h-3 w-40" />
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="border-line border-b px-6 py-5 last:border-0">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="mt-3 h-4 w-4/5" />
              <Skeleton className="mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="surface-panel h-80 p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-5 h-36 w-full" />
        </div>
      </div>
    </main>
  );
}
