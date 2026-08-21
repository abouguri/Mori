import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderClozeField } from "../src/cloze";

const FIXTURES_DIR = join(__dirname, "fixtures", "cloze");

const cases = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("cloze golden fixtures", () => {
  it.each(cases)("%s", (name) => {
    const dir = join(FIXTURES_DIR, name);
    const field = readFileSync(join(dir, "field.txt"), "utf-8");
    const { targetNumber, side } = JSON.parse(readFileSync(join(dir, "case.json"), "utf-8")) as {
      targetNumber: number;
      side: "question" | "answer";
    };
    const expected = readFileSync(join(dir, "expected.html"), "utf-8").replace(/\n$/, "");

    expect(renderClozeField(field, targetNumber, side)).toBe(expected);
  });
});
