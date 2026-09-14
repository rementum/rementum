import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuroraBackdrop } from "./backdrop";

describe("AuroraBackdrop", () => {
  it.each([undefined, false])("disables CSS drift when animated is %s", (animated) => {
    const html = renderToStaticMarkup(
      createElement(AuroraBackdrop, animated === undefined ? {} : { animated }),
    );
    expect(html.match(/class="pui-aurora__blob"/g)).toHaveLength(3);
    expect(html).not.toContain("pui-aurora--drift");
  });
});
