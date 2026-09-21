"use client";

import { usePathname } from "next/navigation";
import type { Dictionary } from "../lib/i18n/get-dictionary";
import { GlideNav } from "./ui/glide";
import {
  IconActivity,
  IconImport,
  IconIndex,
  IconMaintenance,
  IconTasks,
  IconWrites,
} from "./ui/icons";

export function BrainNav({ brainId, strings }: { brainId: string; strings: Dictionary["brains"] }) {
  const pathname = usePathname();
  const items = [
    { label: strings.navIndex, href: `/brains/${brainId}`, icon: IconIndex },
    { label: strings.navWrites, href: `/brains/${brainId}/writes`, icon: IconWrites },
    { label: strings.navTasks, href: `/brains/${brainId}/tasks`, icon: IconTasks },
    {
      label: strings.navMaintenance,
      href: `/brains/${brainId}/maintenance`,
      icon: IconMaintenance,
    },
    { label: strings.navActivity, href: `/brains/${brainId}/activity`, icon: IconActivity },
    { label: strings.navImport, href: `/brains/${brainId}/import`, icon: IconImport },
  ];
  const activeIndex = items.findIndex((item) => item.href === pathname);

  return (
    <div className="overflow-x-auto border-b border-dashed border-line pb-2">
      <GlideNav
        items={items}
        activeIndex={activeIndex}
        orientation="horizontal"
        ariaLabel={strings.management}
      />
    </div>
  );
}
