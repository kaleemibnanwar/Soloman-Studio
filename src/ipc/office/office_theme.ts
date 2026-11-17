/**
 * Color-scheme system for the office document/presentation/spreadsheet
 * templates and dynamic document compilers. Each palette provides high-contrast,
 * accessible, executive-grade hex colors (without leading #) for professional styling.
 */

export type ColorRole = "primary" | "primaryText" | "secondary" | "surface" | "muted" | "border";

export type ColorScheme = Record<ColorRole, string>;

/** Named, built-in palettes. Each is a full ColorScheme (hex, no leading #). */
export const COLOR_SCHEMES: Record<string, ColorScheme> = {
  slate: {
    primary: "0F172A", // Deep Slate (dark 900)
    primaryText: "FFFFFF",
    secondary: "2563EB", // Royal Blue accent
    surface: "F8FAFC", // Off-white clean surface
    muted: "475569", // Slate gray 600
    border: "E2E8F0", // Subtle border
  },
  navy: {
    primary: "0A192F", // Classic Navy
    primaryText: "FFFFFF",
    secondary: "0284C7", // Sky blue accent
    surface: "F0F4F8", // Soft cool background
    muted: "334155", // Dark slate muted
    border: "CBD5E1", // Crisp border
  },
  forest: {
    primary: "1B4332", // Deep Forest Green
    primaryText: "FFFFFF",
    secondary: "2D6A4F", // Rich Emerald Green accent
    surface: "F2F9F5", // Soft mint surface
    muted: "2D4A3E", // Deep forest muted
    border: "D1E7DD", // Soft green border
  },
  crimson: {
    primary: "881337", // Rich Crimson 900
    primaryText: "FFFFFF",
    secondary: "BE123C", // Rose Red 700
    surface: "FFF1F2", // Soft Rose tint
    muted: "831843", // Deep rose muted
    border: "FECDD3", // Soft rose border
  },
  teal: {
    primary: "134E4A", // Dark Pine Teal
    primaryText: "FFFFFF",
    secondary: "0D9488", // Ocean Teal
    surface: "F0FDFA", // Ice Teal tint
    muted: "115E59", // Deep teal muted
    border: "CCFBF1", // Soft teal border
  },
  violet: {
    primary: "3B0764", // Deep Royal Purple
    primaryText: "FFFFFF",
    secondary: "7C3AED", // Electric Violet
    surface: "F5F3FF", // Lilac tint surface
    muted: "5B21B6", // Deep purple muted
    border: "DDD6FE", // Soft purple border
  },
  charcoal: {
    primary: "18181B", // Modern Zinc Black
    primaryText: "FFFFFF",
    secondary: "3F3F46", // Mid Zinc Gray
    surface: "F4F4F5", // Clean Gray surface
    muted: "52525B", // Zinc muted
    border: "E4E4E7", // Clean Zinc border
  },
  sunset: {
    primary: "7C2D12", // Warm Rust
    primaryText: "FFFFFF",
    secondary: "C2410C", // Warm Orange
    surface: "FFF7ED", // Warm peach surface
    muted: "9A3412", // Warm brown-orange
    border: "FED7AA", // Soft warm border
  },
  ocean: {
    primary: "0C4A6E", // Deep Ocean Blue
    primaryText: "FFFFFF",
    secondary: "0284C7", // Bright Cerulean
    surface: "F0F9FF", // Sky tint surface
    muted: "075985", // Ocean muted
    border: "BAE6FD", // Soft ocean border
  },
  emerald: {
    primary: "064E3B", // Pure Emerald Dark
    primaryText: "FFFFFF",
    secondary: "059669", // Bright Emerald
    surface: "ECFDF5", // Soft mint
    muted: "065F46", // Deep green
    border: "A7F3D0", // Emerald border
  },
  graphite: {
    primary: "111827", // Gray 900
    primaryText: "FFFFFF",
    secondary: "374151", // Gray 700
    surface: "F9FAFB", // Gray 50
    muted: "4B5563", // Gray 600
    border: "E5E7EB", // Gray 200
  },
  indigo: {
    primary: "1E1B4B", // Deep Indigo
    primaryText: "FFFFFF",
    secondary: "4F46E5", // Indigo 600
    surface: "EEF2FF", // Indigo 50
    muted: "3730A3", // Indigo 800
    border: "C7D2FE", // Indigo 200
  },
  rose: {
    primary: "881337", // Rose 900
    primaryText: "FFFFFF",
    secondary: "E11D48", // Rose 600
    surface: "FFF1F2", // Rose 50
    muted: "9F1239", // Rose 800
    border: "FECDD3", // Rose 200
  },
  amber: {
    primary: "78350F", // Amber 900
    primaryText: "FFFFFF",
    secondary: "B45309", // Amber 700
    surface: "FFFBEB", // Amber 50
    muted: "78350F", // Amber 900
    border: "FDE68A", // Amber 200
  },
  mint: {
    primary: "064E3B", // Mint 900
    primaryText: "FFFFFF",
    secondary: "0D9488", // Teal 600
    surface: "F0FDFA", // Teal 50
    muted: "115E59", // Teal 800
    border: "99F6E4", // Teal 200
  },
};

export const DEFAULT_COLOR_SCHEME = "slate";

export function listColorSchemeNames(): string[] {
  return Object.keys(COLOR_SCHEMES);
}

const HEX_RE = /^[0-9A-Fa-f]{6}$/;

/** Resolve a named scheme, applying any per-role hex overrides on top. */
export function resolveColorScheme(
  name?: string,
  overrides?: Partial<Record<ColorRole, string>>,
): ColorScheme {
  const base = COLOR_SCHEMES[name ?? DEFAULT_COLOR_SCHEME] ?? COLOR_SCHEMES[DEFAULT_COLOR_SCHEME];
  const scheme: ColorScheme = { ...base };
  if (overrides) {
    for (const [role, hex] of Object.entries(overrides)) {
      if (typeof hex !== "string") continue;
      const cleaned = hex.replace(/^#/, "");
      if (HEX_RE.test(cleaned)) scheme[role as ColorRole] = cleaned.toUpperCase();
    }
  }
  return scheme;
}

/** hex (no #) -> role, as registered per template in office_template_roles.ts */
export type TemplateColorRoles = Record<string, ColorRole>;

/**
 * Deep-clone `value` and replace every 6-hex-digit string that has a
 * registered role with the resolved scheme's hex for that role. Non-hex
 * strings, structural colors with no registered role, and non-color fields
 * are left untouched.
 */
export function recolor(value: unknown, roles: TemplateColorRoles, scheme: ColorScheme): unknown {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (HEX_RE.test(upper) && roles[upper]) return scheme[roles[upper]];
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => recolor(v, roles, scheme));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = recolor(v, roles, scheme);
    }
    return result;
  }
  return value;
}
