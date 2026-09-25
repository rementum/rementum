"use client";

import { usePathname } from "next/navigation";
import type { Dictionary } from "../lib/i18n/get-dictionary";
import { GlideNav } from "./ui/glide";
import { IconActivity, IconTeams } from "./ui/icons";

export function InstanceNav({ strings }: { strings: Dictionary["admin"] }) {
  const pathname = usePathname();
  const items = [
    { label: strings.overview, href: "/admin", icon: IconActivity },
    { label: strings.accounts, href: "/admin/accounts", icon: IconTeams },
  ];
  const activeIndex = items.findIndex((item) => item.href === pathname);

  return (
    <div className="overflow-x-auto border-b border-dashed border-line pb-2">
      <GlideNav
        items={items}
        activeIndex={activeIndex}
        orientation="horizontal"
        ariaLabel={strings.navigation}
      />
    </div>
  );
}
