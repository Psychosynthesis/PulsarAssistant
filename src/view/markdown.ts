import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true });

// marked 15+ uses Array.prototype.at. Pulsar's renderer (and older
// Chromium) may not have it; esbuild does not polyfill.
function shimArrayAt(): void {
  if (typeof Array.prototype.at === "function") return;
  Object.defineProperty(Array.prototype, "at", {
    value(this: ArrayLike<unknown>, n: number) {
      const i = Math.trunc(n) || 0;
      const k = i >= 0 ? i : this.length + i;
      if (k < 0 || k >= this.length) return undefined;
      return this[k];
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * While a response is streaming, a partially emitted fenced code block
 * (``` without its closing ```) makes marked treat the entire rest of the
 * message as code and then "jump" once the closing fence finally arrives.
 * Before parsing we virtually close any dangling fence so the intermediate
 * render is stable. The virtual fence is removed on the next full render.
 */
export function balanceFenceDelimiters(text: string): string {
  const fences = text.match(/```/g);
  if (!fences) return text;
  if (fences.length % 2 === 1) return `${text}\n\`\`\``;
  return text;
}

export function renderMarkdown(el: HTMLElement, text: string): void {
  shimArrayAt();
  try {
    const balanced = balanceFenceDelimiters(text);
    el.innerHTML = DOMPurify.sanitize(marked.parse(balanced) as string);
  } catch (error) {
    console.error("[pulsar-assistant] markdown parse failed", error);
    el.textContent = text;
  }
}

export const renderMarkdownHtml = renderMarkdown;
