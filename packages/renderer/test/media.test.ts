import { describe, expect, it } from "vitest";
import { rewriteCss, rewriteMedia } from "../src/media";

const resolve = (filename: string) => `https://cdn.example/${filename}`;

describe("rewriteMedia", () => {
  it("rewrites an img src", () => {
    expect(rewriteMedia('<img src="cat.jpg">', resolve)).toBe(
      '<img src="https://cdn.example/cat.jpg">',
    );
  });

  it("rewrites audio, video, and source src attributes", () => {
    const html = '<audio src="a.mp3"></audio><video src="b.mp4"><source src="c.webm"></video>';
    expect(rewriteMedia(html, resolve)).toBe(
      '<audio src="https://cdn.example/a.mp3"></audio>' +
        '<video src="https://cdn.example/b.mp4"><source src="https://cdn.example/c.webm"></video>',
    );
  });

  it("leaves absolute and data: URLs alone", () => {
    const html = '<img src="https://other.example/x.png"><img src="data:image/png;base64,abc">';
    expect(rewriteMedia(html, resolve)).toBe(html);
  });

  it("rewrites [sound:file] into a native audio element", () => {
    expect(rewriteMedia("[sound:clip.mp3]", resolve)).toBe(
      '<audio controls src="https://cdn.example/clip.mp3"></audio>',
    );
  });

  it("rewrites multiple media references in one string", () => {
    const html = '<img src="a.png">text[sound:b.mp3]<img src="c.gif">';
    expect(rewriteMedia(html, resolve)).toBe(
      '<img src="https://cdn.example/a.png">text' +
        '<audio controls src="https://cdn.example/b.mp3"></audio>' +
        '<img src="https://cdn.example/c.gif">',
    );
  });
});

describe("rewriteCss", () => {
  it("rewrites a url() reference", () => {
    expect(rewriteCss(".card { background: url(bg.png); }", resolve)).toBe(
      '.card { background: url(https://cdn.example/bg.png); }',
    );
  });

  it("preserves quote style around the URL", () => {
    expect(rewriteCss("url('bg.png')", resolve)).toBe("url('https://cdn.example/bg.png')");
    expect(rewriteCss('url("bg.png")', resolve)).toBe('url("https://cdn.example/bg.png")');
  });

  it("leaves absolute URLs alone", () => {
    const css = "url(https://other.example/bg.png)";
    expect(rewriteCss(css, resolve)).toBe(css);
  });
});
