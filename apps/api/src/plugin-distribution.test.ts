import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const skills = ["brain-context", "brain-write", "brain-import", "brain-maintenance"];
const hostedWorkspaceUrl = "https://rementum.dev/mcp/workspace/WORKSPACE_UUID";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath: string): Record<string, unknown> {
  const value: unknown = JSON.parse(read(relativePath));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${relativePath} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

describe("agent plugin distribution", () => {
  it("publishes one canonical skill set through every plugin format", () => {
    for (const skill of skills) {
      expect(fs.existsSync(path.join(root, "plugins/rementum/skills", skill, "SKILL.md"))).toBe(
        true,
      );
    }

    const codex = readJson("plugins/rementum/.codex-plugin/plugin.json");
    const claude = readJson("plugins/rementum/.claude-plugin/plugin.json");
    const portable = readJson("plugins/rementum/plugin.json");

    expect(codex).toMatchObject({ name: "rementum", skills: "./skills/" });
    expect(claude).toMatchObject({ name: "rementum" });
    expect(portable).toMatchObject({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "rementum",
    });
    expect(new Set([codex.version, claude.version, portable.version])).toEqual(new Set(["0.1.0"]));
  });

  it("publishes host marketplaces that resolve the shared plugin", () => {
    expect(readJson(".agents/plugins/marketplace.json")).toMatchObject({
      name: "rementum",
      plugins: [
        {
          name: "rementum",
          source: { source: "local", path: "./plugins/rementum" },
        },
      ],
    });
    expect(readJson(".claude-plugin/marketplace.json")).toMatchObject({
      name: "rementum",
      plugins: [{ name: "rementum", source: "./plugins/rementum" }],
    });
    expect(readJson(".cursor-plugin/marketplace.json")).toMatchObject({
      name: "rementum",
      plugins: [{ name: "rementum", source: "plugins/rementum", version: "0.1.0" }],
    });
  });

  it("defaults integration examples to the hosted workspace endpoint", () => {
    const integrationFiles = [
      "docs/integrations.md",
      "integrations/claude/README.md",
      "integrations/codex/README.md",
      "integrations/cursor/mcp.json",
      "plugins/rementum/README.md",
    ];

    for (const relativePath of integrationFiles) {
      const contents = read(relativePath);
      expect(contents).toContain(hostedWorkspaceUrl);
      expect(contents).not.toContain("YOUR_HOST");
      expect(contents).not.toContain("memory.example.com");
    }
  });

  it("does not publish a concrete workspace id or credential", () => {
    const distributedFiles = [
      ".agents/plugins/marketplace.json",
      ".claude-plugin/marketplace.json",
      ".cursor-plugin/marketplace.json",
      "plugins/rementum/.claude-plugin/plugin.json",
      "plugins/rementum/.codex-plugin/plugin.json",
      "plugins/rementum/plugin.json",
    ];
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

    for (const relativePath of distributedFiles) {
      expect(read(relativePath)).not.toMatch(uuid);
    }
  });
});
