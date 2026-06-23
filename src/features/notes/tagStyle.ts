import type { CSSProperties } from "react";
import { TAG_COLORS } from "../../lib/types";

/** Resolve a stored tag color key into chip styles (text + translucent fill). */
export function tagStyle(color: string): CSSProperties {
  const hex = TAG_COLORS[color] ?? TAG_COLORS.gray;
  return { color: hex, backgroundColor: `${hex}22`, borderColor: `${hex}55` };
}

/** Solid hex for a tag color key (e.g. for dots/swatches). */
export function tagHex(color: string): string {
  return TAG_COLORS[color] ?? TAG_COLORS.gray;
}
