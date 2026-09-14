import type * as acp from "@agentclientprotocol/sdk";

// Converts ACP prompt content blocks into the plain-text prompt used by
// backends that do not speak ACP (currently the Cursor HTTP backend).
export function contentBlocksToText(blocks: acp.ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      if (block.text.trim()) parts.push(block.text.trim());
      continue;
    }
    if (block.type === "resource") {
      const resource = block.resource;
      if (
        resource &&
        "text" in resource &&
        typeof resource.text === "string"
      ) {
        parts.push(
          `<file uri="${resource.uri}">\n${resource.text}\n</file>`,
        );
      }
    }
  }
  return parts.join("\n\n").trim();
}
