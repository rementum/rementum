import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDictionary, template } from "../../lib/i18n/get-dictionary";
import { ConfirmDialog } from "./confirm-dialog";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  createPortal: (children: unknown) => children,
}));
afterEach(() => vi.unstubAllGlobals());

describe("ConfirmDialog labels", () => {
  it.each(["en", "tr", "zh"] as const)(
    "renders %s cancellation and confirmation copy",
    (locale) => {
      vi.stubGlobal("document", { body: {} });
      const strings = getDictionary(locale).brains;
      const hint = template(strings.confirmationHint, { name: "Example brain" });
      const html = renderToStaticMarkup(
        createElement(ConfirmDialog, {
          open: true,
          title: strings.deleteTitle,
          description: strings.deleteDescription,
          confirmLabel: strings.deleteBrain,
          cancelLabel: strings.cancel,
          confirmationLabel: strings.confirmation,
          confirmationHint: hint,
          expectedName: "Example brain",
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
      expect(html).toContain(`aria-label="${strings.cancel}"`);
      expect(html).toContain(`>${strings.cancel}</button>`);
      expect(html).toContain(`>${strings.confirmation}</label>`);
      expect(html).toContain(renderToStaticMarkup(hint));
    },
  );

  it("keeps English defaults for callers without translations", () => {
    vi.stubGlobal("document", { body: {} });
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        open: true,
        title: "Delete",
        description: "Delete this item.",
        confirmLabel: "Delete",
        expectedName: "Example",
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Cancel"');
    expect(html).toContain(">Confirmation</label>");
    expect(html).toContain("Type &quot;Example&quot; to continue.");
  });
});
