import { describe, expect, it } from "vitest";
import { rewriteLatex } from "../src/latex";

describe("rewriteLatex", () => {
  it("wraps a [latex]...[/latex] block with pre/post", () => {
    const html = "See [latex]x^2[/latex] here.";
    expect(rewriteLatex(html, "\\begin{eq}", "\\end{eq}")).toBe(
      'See <span class="latex-block">\\begin{eq}x^2\\end{eq}</span> here.',
    );
  });

  it("wraps a [$$]...[$$] display block", () => {
    expect(rewriteLatex("[$$]x^2[$$]", "", "")).toBe('<span class="latex-block">x^2</span>');
  });

  it("wraps a [$]...[$] inline span", () => {
    expect(rewriteLatex("[$]x^2[$]", "", "")).toBe('<span class="latex-inline">x^2</span>');
  });

  it("escapes HTML-significant characters in the TeX source", () => {
    expect(rewriteLatex("[$]a < b & c > d[$]", "", "")).toBe(
      '<span class="latex-inline">a &lt; b &amp; c &gt; d</span>',
    );
  });

  it("handles multiple segments in one template", () => {
    const html = "Inline [$]a[$] and block [$$]b[$$].";
    expect(rewriteLatex(html, "", "")).toBe(
      'Inline <span class="latex-inline">a</span> and block <span class="latex-block">b</span>.',
    );
  });

  it("leaves text with no LaTeX segments untouched", () => {
    expect(rewriteLatex("plain text", "pre", "post")).toBe("plain text");
  });
});
