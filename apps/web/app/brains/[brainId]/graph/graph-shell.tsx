"use client";

import {
  ControlsContainer,
  SigmaContainer,
  useCamera,
  useRegisterEvents,
  useSetSettings,
  useSigma,
  ZoomControl,
} from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import type { ArticleGraph, ArticleGraphEdge, ArticleGraphNode } from "@rementum/contracts";
import { MultiDirectedGraph } from "graphology";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EdgeArrowProgram } from "sigma/rendering";
import { Chip } from "../../../../components/ui/chip";
import { EmptyState } from "../../../../components/ui/empty-state";

interface Palette {
  canvas: string;
  label: string;
  accent: string;
  outbound: string;
  inbound: string;
  manual: string;
  edge: string;
  edgeMuted: string;
  nodeMuted: string;
}

interface GraphNodeAttributes {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  slug: string;
  kind: string;
  freshness: string;
}

interface GraphEdgeAttributes {
  size: number;
  color: string;
  type: "arrow";
  source: string;
  target: string;
  origin: "wiki" | "manual";
  relation: string;
}

export function GraphShell({ graph }: { graph: ArticleGraph }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const themeVersion = useThemeVersion();
  const palette = useMemo(() => readPalette(themeVersion > 0), [themeVersion]);
  const degrees = useMemo(() => relationDegrees(graph), [graph]);
  const sigmaGraph = useMemo(
    () => buildSigmaGraph(graph, degrees, palette),
    [graph, degrees, palette],
  );
  const settings = useMemo(
    () => ({
      allowInvalidContainer: true,
      defaultEdgeType: "arrow",
      edgeProgramClasses: { arrow: EdgeArrowProgram },
      labelColor: { color: palette.label },
      labelFont: "Geist Sans, sans-serif",
      labelSize: 12,
      labelDensity: 0.8,
      labelRenderedSizeThreshold: 7,
      renderEdgeLabels: false,
      hideLabelsOnMove: true,
      hideEdgesOnMove: false,
      minCameraRatio: 0.04,
      maxCameraRatio: 3,
      stagePadding: 42,
      zIndex: true,
    }),
    [palette],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const matchingNodes = useMemo(
    () =>
      graph.nodes.filter((node) => {
        if (!normalizedQuery) return true;
        return [node.title, node.slug, ...node.aliases].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      }),
    [graph.nodes, normalizedQuery],
  );
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? null;

  if (!graph.nodes.length) {
    return (
      <div className="rounded-card bg-surface p-8 shadow-card">
        <EmptyState
          title="No articles to map."
          body="Create and promote an article, then its relations will appear here."
        />
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-dashed border-line px-4 py-3">
        <Stat value={graph.nodes.length} label="articles" />
        <Stat value={graph.edges.length} label="relations" />
        <Stat
          value={graph.edges.filter((edge) => edge.toArticleId === null).length}
          label="unresolved"
        />
        {graph.pendingRelationIndexes ? (
          <span className="ml-auto rounded-control border border-orange/30 bg-orange-tint px-2.5 py-1 font-mono text-2xs text-orange">
            {graph.pendingRelationIndexes} awaiting body-link indexing
          </span>
        ) : (
          <span className="ml-auto font-mono text-2xs text-ink-3">Relation index current</span>
        )}
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_310px]">
        <section
          aria-label={`Interactive relation graph with ${graph.nodes.length} articles`}
          className="relative min-h-[520px] border-b border-line bg-canvas lg:min-h-[680px] lg:border-b-0 lg:border-r"
        >
          <SigmaContainer
            className="absolute inset-0"
            graph={sigmaGraph}
            settings={settings}
            style={{ height: "100%", width: "100%" }}
          >
            <GraphController
              graph={graph}
              palette={palette}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <ControlsContainer position="bottom-right">
              <ZoomControl animationDuration={prefersReducedMotion() ? 0 : 180} />
            </ControlsContainer>
          </SigmaContainer>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-control border border-line bg-surface/90 px-3 py-2 shadow-card backdrop-blur">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              Selection paths
            </p>
            <div className="mt-1.5 flex items-center gap-3 font-mono text-2xs text-ink-2">
              <Legend color={palette.outbound} label="outgoing" />
              <Legend color={palette.inbound} label="incoming" />
            </div>
          </div>
        </section>
        <aside className="min-h-0 bg-surface">
          <div className="border-b border-dashed border-line p-4">
            <label
              className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3"
              htmlFor="graph-search"
            >
              Find an article
            </label>
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-control border border-line bg-field px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
              id="graph-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, slug, or alias"
              type="search"
              value={query}
            />
            {normalizedQuery ? (
              <SearchResults
                nodes={matchingNodes}
                onSelect={(nodeId) => {
                  setSelectedId(nodeId);
                  setQuery("");
                }}
              />
            ) : null}
          </div>
          {selected ? (
            <ArticleInspector
              graph={graph}
              node={selected}
              onClear={() => setSelectedId(null)}
              onSelect={setSelectedId}
            />
          ) : (
            <GraphOverview graph={graph} degrees={degrees} onSelect={setSelectedId} />
          )}
        </aside>
      </div>
    </section>
  );
}

function GraphController({
  graph,
  palette,
  selectedId,
  onSelect,
}: {
  graph: ArticleGraph;
  palette: Palette;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
}) {
  const sigma = useSigma<GraphNodeAttributes, GraphEdgeAttributes>();
  const registerEvents = useRegisterEvents();
  const setSettings = useSetSettings<GraphNodeAttributes, GraphEdgeAttributes>();
  const { gotoNode } = useCamera({ duration: prefersReducedMotion() ? 0 : 280 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const focusId = selectedId ?? hoveredId;
  const { start, stop } = useWorkerLayoutForceAtlas2({
    settings: {
      barnesHutOptimize: graph.nodes.length > 100,
      gravity: 1.2,
      scalingRatio: 7,
      slowDown: 3,
      strongGravityMode: false,
    },
  });

  useEffect(() => {
    if (prefersReducedMotion() || graph.nodes.length < 2) return;
    start();
    const timer = window.setTimeout(stop, graph.nodes.length > 500 ? 3_200 : 2_000);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [graph.nodes.length, start, stop]);

  useEffect(() => {
    registerEvents({
      enterNode: ({ node }) => {
        setHoveredId(node);
        sigma.getContainer().style.cursor = "pointer";
      },
      leaveNode: () => {
        setHoveredId(null);
        sigma.getContainer().style.cursor = "default";
      },
      clickNode: ({ node }) => onSelect(node),
      clickStage: () => onSelect(null),
    });
  }, [onSelect, registerEvents, sigma]);

  useEffect(() => {
    const renderedGraph = sigma.getGraph();
    const outgoing = focusId ? new Set(renderedGraph.outNeighbors(focusId)) : new Set<string>();
    const incoming = focusId ? new Set(renderedGraph.inNeighbors(focusId)) : new Set<string>();
    setSettings({
      nodeReducer: (node, data) => {
        if (!focusId) return data;
        if (node === focusId) {
          return {
            ...data,
            color: palette.accent,
            forceLabel: true,
            highlighted: true,
            size: data.size * 1.55,
            zIndex: 3,
          };
        }
        if (outgoing.has(node)) {
          return { ...data, color: palette.outbound, forceLabel: true, zIndex: 2 };
        }
        if (incoming.has(node)) {
          return { ...data, color: palette.inbound, forceLabel: true, zIndex: 2 };
        }
        return { ...data, color: palette.nodeMuted, label: "", size: data.size * 0.72 };
      },
      edgeReducer: (_edge, data) => {
        if (!focusId) return data;
        if (data.source === focusId) {
          return { ...data, color: palette.outbound, size: 2.2, zIndex: 2 };
        }
        if (data.target === focusId) {
          return { ...data, color: palette.inbound, size: 2.2, zIndex: 2 };
        }
        return { ...data, color: palette.edgeMuted, size: 0.35 };
      },
    });
    sigma.refresh();
  }, [focusId, palette, setSettings, sigma]);

  useEffect(() => {
    if (selectedId) gotoNode(selectedId, { duration: prefersReducedMotion() ? 0 : 280 });
  }, [gotoNode, selectedId]);

  return null;
}

function ArticleInspector({
  graph,
  node,
  onClear,
  onSelect,
}: {
  graph: ArticleGraph;
  node: ArticleGraphNode;
  onClear: () => void;
  onSelect: (nodeId: string) => void;
}) {
  const outgoing = graph.edges.filter((edge) => edge.fromArticleId === node.id);
  const incoming = graph.edges.filter((edge) => edge.toArticleId === node.id);
  const nodes = new Map(graph.nodes.map((item) => [item.id, item]));
  return (
    <div className="max-h-[680px] overflow-y-auto p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-2xs uppercase tracking-[0.08em] text-ink-3">Selected</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">{node.title}</h2>
          <p className="mt-1 break-all font-mono text-2xs text-ink-3">{node.slug}</p>
        </div>
        <button
          className="rounded-control px-2 py-1 font-mono text-2xs text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          onClick={onClear}
          type="button"
        >
          Clear
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{node.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{node.kind}</Chip>
        <Chip>{node.freshness}</Chip>
        {node.aliases.map((alias) => (
          <Chip key={alias}>{alias}</Chip>
        ))}
      </div>
      <Link
        className="mt-4 inline-flex items-center rounded-control border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-hover"
        href={`/articles/${node.id}`}
      >
        Read article →
      </Link>
      <RelationGroup direction="Outgoing" edges={outgoing} nodes={nodes} onSelect={onSelect} />
      <RelationGroup direction="Incoming" edges={incoming} nodes={nodes} onSelect={onSelect} />
    </div>
  );
}

function RelationGroup({
  direction,
  edges,
  nodes,
  onSelect,
}: {
  direction: "Outgoing" | "Incoming";
  edges: ArticleGraphEdge[];
  nodes: Map<string, ArticleGraphNode>;
  onSelect: (nodeId: string) => void;
}) {
  if (!edges.length) return null;
  return (
    <div className="mt-6">
      <p className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        {direction} · {edges.length}
      </p>
      <ul className="mt-2 space-y-1">
        {edges.map((edge) => {
          const relatedId = direction === "Outgoing" ? edge.toArticleId : edge.fromArticleId;
          const related = relatedId ? nodes.get(relatedId) : null;
          return (
            <li
              key={`${edge.origin}:${edge.fromArticleId}:${edge.toArticleId ?? "unresolved"}:${edge.targetSlug}:${edge.relation}`}
            >
              {related ? (
                <button
                  className="group w-full rounded-control px-2.5 py-2 text-left transition-colors hover:bg-hover"
                  onClick={() => onSelect(related.id)}
                  type="button"
                >
                  <span className="block truncate text-xs font-medium text-ink group-hover:text-accent">
                    {related.title}
                  </span>
                  <RelationMeta edge={edge} />
                </button>
              ) : (
                <div className="rounded-control border border-dashed border-orange/30 bg-orange-tint px-2.5 py-2">
                  <span className="block truncate font-mono text-xs text-orange">
                    {edge.targetSlug}
                  </span>
                  <span className="font-mono text-2xs text-orange">unresolved wiki target</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RelationMeta({ edge }: { edge: ArticleGraphEdge }) {
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <Chip tone={edge.origin === "wiki" ? "accent" : "neutral"}>{edge.origin}</Chip>
      <span className="min-w-0 truncate font-mono text-2xs text-ink-3">
        {edge.origin === "manual" ? edge.relation : edge.targetSlug}
      </span>
    </span>
  );
}

function GraphOverview({
  graph,
  degrees,
  onSelect,
}: {
  graph: ArticleGraph;
  degrees: Map<string, number>;
  onSelect: (nodeId: string) => void;
}) {
  const hubs = [...graph.nodes]
    .sort((left, right) => (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0))
    .slice(0, 8);
  return (
    <div className="max-h-[680px] overflow-y-auto p-4">
      <p className="font-mono text-2xs uppercase tracking-[0.08em] text-ink-3">Explore</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Knowledge topology</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Select a node to isolate its incoming and outgoing paths. Node size reflects relation count.
      </p>
      <p className="mt-6 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        Most connected
      </p>
      <ul className="mt-2 space-y-1">
        {hubs.map((node) => (
          <li key={node.id}>
            <button
              className="flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-hover"
              onClick={() => onSelect(node.id)}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                {node.title}
              </span>
              <span className="font-mono text-2xs tabular-nums text-ink-3">
                {degrees.get(node.id) ?? 0}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <details className="group mt-6 border-t border-dashed border-line pt-4">
        <summary className="cursor-pointer list-none font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
          All articles · {graph.nodes.length}
        </summary>
        <ul className="mt-2 space-y-1">
          {graph.nodes.map((node) => (
            <li key={node.id}>
              <button
                className="w-full truncate rounded-control px-2.5 py-1.5 text-left text-xs text-ink-2 hover:bg-hover hover:text-ink"
                onClick={() => onSelect(node.id)}
                type="button"
              >
                {node.title}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function SearchResults({
  nodes,
  onSelect,
}: {
  nodes: ArticleGraphNode[];
  onSelect: (nodeId: string) => void;
}) {
  return (
    <div className="mt-2 max-h-52 overflow-y-auto rounded-control border border-line bg-canvas p-1">
      {nodes.length ? (
        nodes.map((node) => (
          <button
            className="block w-full rounded-control px-2.5 py-2 text-left hover:bg-hover"
            key={node.id}
            onClick={() => onSelect(node.id)}
            type="button"
          >
            <span className="block truncate text-xs font-medium text-ink">{node.title}</span>
            <span className="block truncate font-mono text-2xs text-ink-3">{node.slug}</span>
          </button>
        ))
      ) : (
        <p className="px-2.5 py-3 text-xs text-ink-3">No matching article.</p>
      )}
    </div>
  );
}

function buildSigmaGraph(data: ArticleGraph, degrees: Map<string, number>, palette: Palette) {
  const graph = new MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>();
  data.nodes.forEach((node, index) => {
    const angle = index * 2.399963229728653;
    const radius = 2.5 + Math.sqrt(index + 1) * 2.4;
    const degree = degrees.get(node.id) ?? 0;
    graph.addNode(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size: 5 + Math.min(10, Math.sqrt(degree) * 2.2),
      label: node.title,
      color:
        node.freshness === "stale" || node.freshness === "review_due"
          ? palette.inbound
          : node.kind === "log"
            ? palette.manual
            : palette.accent,
      slug: node.slug,
      kind: node.kind,
      freshness: node.freshness,
    });
  });
  data.edges.forEach((edge, index) => {
    if (
      !edge.toArticleId ||
      !graph.hasNode(edge.fromArticleId) ||
      !graph.hasNode(edge.toArticleId)
    ) {
      return;
    }
    graph.addEdgeWithKey(
      `${edge.origin}:${edge.fromArticleId}:${edge.targetSlug}:${edge.relation}:${index}`,
      edge.fromArticleId,
      edge.toArticleId,
      {
        size: edge.origin === "wiki" ? 1.05 : 0.85,
        color: edge.origin === "wiki" ? palette.accent : palette.edge,
        type: "arrow",
        source: edge.fromArticleId,
        target: edge.toArticleId,
        origin: edge.origin,
        relation: edge.relation,
      },
    );
  });
  return graph;
}

function relationDegrees(graph: ArticleGraph): Map<string, number> {
  const degrees = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    degrees.set(edge.fromArticleId, (degrees.get(edge.fromArticleId) ?? 0) + 1);
    if (edge.toArticleId) degrees.set(edge.toArticleId, (degrees.get(edge.toArticleId) ?? 0) + 1);
  }
  return degrees;
}

function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((current) => current + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setVersion(1);
    return () => observer.disconnect();
  }, []);
  return version;
}

function readPalette(readDocumentTheme: boolean): Palette {
  const dark =
    readDocumentTheme &&
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  return dark
    ? {
        canvas: "#131d19",
        label: "#bdcbc5",
        accent: "#2f8a70",
        outbound: "#79aa98",
        inbound: "#d9ccb5",
        manual: "#8fa099",
        edge: "#64756d",
        edgeMuted: "#22302a",
        nodeMuted: "#33413b",
      }
    : {
        canvas: "#edf1ec",
        label: "#43544d",
        accent: "#2f6f5e",
        outbound: "#79aa98",
        inbound: "#8a6b2f",
        manual: "#64756d",
        edge: "#84938c",
        edgeMuted: "#dfe6e1",
        nodeMuted: "#c7d2cc",
      };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <strong className="font-mono text-sm tabular-nums text-ink">{value}</strong>
      <span className="font-mono text-2xs text-ink-3">{label}</span>
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
