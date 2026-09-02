"use client";

import { usePathname } from "next/navigation";
import { GlideNav } from "./ui/glide";
import { IconActivity, IconTeams } from "./ui/icons";

export function InstanceNav() {
  const pathname = usePathname();
  const items = [
    { label: "Overview", href: "/admin", icon: IconActivity },
    { label: "Accounts", href: "/admin/accounts", icon: IconTeams },
  ];
  const activeIndex = items.findIndex((item) => item.href === pathname);

  return (
    <div className="overflow-x-auto border-b border-dashed border-line pb-2">
      <GlideNav
        items={items}
        activeIndex={activeIndex}
        orientation="horizontal"
        ariaLabel="Instance administration"
      />
    </div>
  );
}
