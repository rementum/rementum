import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentConnect } from "./agent-connect";

describe("AgentConnect", () => {
  it("renders workspace-scoped commands for every harness with the integration guide", () => {
    const mcpUrl = "https://memory.example.test/mcp/workspace/workspace-id";
    const html = renderToStaticMarkup(
      createElement(AgentConnect, { workspaceName: "Product knowledge", mcpUrl }),
    );

    expect(html).toContain("Connect Product knowledge to an agent.");
    expect(html).toContain(
      "npx -y skills add yibudak/rementum --global --agent claude-code --skill &#x27;*&#x27; --yes",
    );
    expect(html).toContain(
      "npx -y skills add yibudak/rementum --global --agent codex --skill &#x27;*&#x27; --yes",
    );
    expect(html).toContain(
      "npx -y skills add yibudak/rementum --global --agent opencode --skill &#x27;*&#x27; --yes",
    );
    expect(html).toContain(`claude mcp add --scope user --transport http rementum ${mcpUrl}`);
    expect(html).toContain(`codex mcp add rementum --url ${mcpUrl}`);
    expect(html).toContain(`opencode mcp add rementum --url ${mcpUrl}`);
    expect(html).toContain("https://rementum.dev/integrations/");
  });
});
