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
