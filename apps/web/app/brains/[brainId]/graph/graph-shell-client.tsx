"use client";

import type { ArticleGraph } from "@rementum/contracts";
import dynamic from "next/dynamic";

const GraphShell = dynamic(() => import("./graph-shell").then((module) => module.GraphShell), {
  ssr: false,
  loading: () => (
    <section
      aria-busy="true"
      aria-label="Loading relation graph"
      className="min-h-[520px] animate-pulse rounded-card border border-line bg-surface shadow-card motion-reduce:animate-none lg:min-h-[680px]"
    />
  ),
});

export function GraphShellClient({ graph }: { graph: ArticleGraph }) {
  return <GraphShell graph={graph} />;
}
