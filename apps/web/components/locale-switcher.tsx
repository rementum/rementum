"use client";

import { usePathname } from "next/navigation";

import {
  isLocalizedRoutePath,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
  parseLocale,
  SITE_URL_HREF,
} from "../lib/i18n/locales";
import { DropdownMenu } from "./ui/dropdown-menu";
import { IconGlobe } from "./ui/icons";

export function LocaleSwitcher({
  locale,
  label,
  className,
  compact = false,
}: {
  locale: Locale;
  label: string;
  className?: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className={className}>
      <DropdownMenu
        label={`${label}: ${LOCALE_LABELS[locale]}`}
        trigger={
          <>
            {compact ? null : <IconGlobe />}
            <span className="font-mono text-xs">{locale.toUpperCase()}</span>
          </>
        }
        items={LOCALES.map((value) => ({
          id: value,
          label: LOCALE_LABELS[value],
          selected: value === locale,
        }))}
        onSelect={(next) => {
          if (next === locale) return;
          document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
          if (isLocalizedRoutePath(pathname))
            window.location.assign(SITE_URL_HREF[parseLocale(next)] || "/");
          else window.location.reload();
        }}
      />
    </div>
  );
}
