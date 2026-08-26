"use client";

import { usePathname } from "next/navigation";
import { GlideNav } from "./ui/glide";
import {
  IconActivity,
  IconImport,
  IconIndex,
  IconMaintenance,
  IconTasks,
  IconWrites,
} from "./ui/icons";

export function BrainNav({ brainId }: { brainId: string }) {
  const pathname = usePathname();
  const items = [
    { label: "Index", href: `/brains/${brainId}`, icon: IconIndex },
    { label: "Writes", href: `/brains/${brainId}/writes`, icon: IconWrites },
    { label: "Tasks", href: `/brains/${brainId}/tasks`, icon: IconTasks },
    { label: "Maintenance", href: `/brains/${brainId}/maintenance`, icon: IconMaintenance },
    { label: "Activity", href: `/brains/${brainId}/activity`, icon: IconActivity },
    { label: "Import", href: `/brains/${brainId}/import`, icon: IconImport },
  ];
  const activeIndex = items.findIndex((item) => item.href === pathname);

  return (
    <div className="overflow-x-auto border-b border-dashed border-line pb-2">
      <GlideNav items={items} activeIndex={activeIndex} orientation="horizontal" />
    </div>
  );
}
