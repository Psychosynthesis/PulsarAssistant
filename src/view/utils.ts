export type CreateElementOptions = {
  class?: string | readonly string[];
  id?: string;
  style?: Partial<CSSStyleDeclaration>;
};

/**
 * Creates an HTML element with optional classes, id, and inline styles.
 *
 * `class` accepts a single class name, a whitespace-separated class list, or
 * an array of class names. This keeps view code free of the repeated
 * `document.createElement` + `classList.add` boilerplate.
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: CreateElementOptions = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options.class) {
    const classes =
      typeof options.class === "string"
        ? options.class.split(/\s+/).filter(Boolean)
        : options.class;
    if (classes.length > 0) {
      element.classList.add(...classes);
    }
  }

  if (options.id) {
    element.id = options.id;
  }

  if (options.style) {
    Object.assign(element.style, options.style);
  }

  return element;
}

/**
 * Parses an HTML string and returns its first element child. Use this for
 * static view skeletons instead of long `createElement` chains. The template
 * must contain exactly one root element.
 */
export function elementFromHtml<T extends HTMLElement = HTMLElement>(
  html: string,
): T {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error("elementFromHtml: template must contain a single root element");
  }
  return element as T;
}

/**
 * Resolves a `data-ref` child of `root`. Keeps template-built skeletons
 * readable: mark a node with `data-ref="name"` and fetch it here instead of
 * relying on positional child traversal.
 */
export function ref<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  name: string,
): T {
  const element = root.querySelector<T>(`[data-ref="${name}"]`);
  if (!element) {
    throw new Error(`Missing data-ref="${name}" element`);
  }
  return element;
}

/** Escapes user/derived text before interpolating it into HTML strings. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Formats a byte count into a compact human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Coerces an unknown thrown value into a readable message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Builds the chat error block (header + optional preformatted body). */
export function buildErrorElement(
  text: string,
  extraClasses: readonly string[] = [],
): HTMLDivElement {
  const message = createElement("div", {
    class: [
      "pulsar-assistant-message",
      "pulsar-assistant-message--error",
      ...extraClasses,
    ],
  });

  const parts = text.split("\n\n");
  if (parts.length > 1) {
    const header = createElement("div", { class: "pulsar-assistant-error-header" });
    header.textContent = parts[0];
    message.appendChild(header);

    const body = createElement("pre", { class: "pulsar-assistant-error-body" });
    body.textContent = parts.slice(1).join("\n\n");
    message.appendChild(body);
  } else {
    message.textContent = text;
  }

  return message;
}
