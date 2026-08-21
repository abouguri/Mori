import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, type RenderContext } from "../src/template";

const FIXTURES_DIR = join(__dirname, "fixtures");

// Cloze fixtures use a different shape (field + target number + side) and
// have their own runner in cloze.test.ts — see test/fixtures/cloze/.
const cases = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "cloze")
  .map((entry) => entry.name)
  .sort();

describe("template golden fixtures", () => {
  it.each(cases)("%s", (name) => {
    const dir = join(FIXTURES_DIR, name);
    const template = readFileSync(join(dir, "template.txt"), "utf-8");
    const context = JSON.parse(readFileSync(join(dir, "fields.json"), "utf-8")) as RenderContext;
    const expected = readFileSync(join(dir, "expected.html"), "utf-8").replace(/\n$/, "");

    expect(render(template, context)).toBe(expected);
  });
});
