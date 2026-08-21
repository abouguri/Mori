import { describe, expect, it } from "vitest";
import { cardExists, renderAnswer, renderQuestion } from "../src/index";

describe("cardExists", () => {
  it("is true when the question renders non-empty content", () => {
    expect(cardExists("{{Front}}", { Front: "hello" })).toBe(true);
  });

  it("is false when the front field is blank", () => {
    expect(cardExists("{{Front}}", { Front: "" })).toBe(false);
  });

  it("is false when the question is only markup with no text", () => {
    expect(cardExists("<div>{{Front}}</div>", { Front: "" })).toBe(false);
  });

  it("is true when a conditional reveals static text even with an empty field", () => {
    expect(cardExists("{{^Front}}reversed card{{/Front}}", { Front: "" })).toBe(true);
  });
});

describe("renderQuestion / renderAnswer", () => {
  it("rewrites media and resolves {{FrontSide}} on the answer", () => {
    const ctx = {
      fields: { Front: '<img src="cat.jpg">', Back: "the answer" },
      resolveMedia: (f: string) => `/media/${f}`,
    };
    const question = renderQuestion("{{Front}}", ctx);
    expect(question).toBe('<img src="/media/cat.jpg">');

    const answer = renderAnswer("{{FrontSide}}<hr>{{Back}}", ctx, question);
    expect(answer).toBe('<img src="/media/cat.jpg"><hr>the answer');
  });

  it("shows the target cloze revealed only on the answer side", () => {
    const ctx = {
      fields: { Text: "Paris is the capital of {{c1::France}}." },
      clozeNumber: 1,
    };
    const question = renderQuestion("{{cloze:Text}}", ctx);
    expect(question).toBe('Paris is the capital of <span class="cloze">[...]</span>.');

    const answer = renderAnswer("{{cloze:Text}}", ctx, question);
    expect(answer).toBe('Paris is the capital of <span class="cloze">France</span>.');
  });

  it("wraps LaTeX using the note type's pre/post after template rendering", () => {
    const ctx = {
      fields: { Front: "[$]x^2[$]" },
      latexPre: "\\(",
      latexPost: "\\)",
    };
    expect(renderQuestion("{{Front}}", ctx)).toBe(
      '<span class="latex-inline">\\(x^2\\)</span>',
    );
  });
});
