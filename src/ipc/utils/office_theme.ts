/**
 * Color-scheme system for the office document/presentation/spreadsheet
 * templates. Each template's hand-picked brand colors are registered in
 * `office_template_roles.ts` as a hex -> semantic role map; `recolor` walks a
 * template's JSON and swaps every hex that has a registered role for the
 * chosen scheme's hex, leaving everything else (structural blacks/whites,
 * layout, fonts, spacing) untouched.
 */

export type ColorRole =
  | "primary"
  | "primaryText"
  | "secondary"
  | "surface"
  | "muted"
  | "border";

export type ColorScheme = Record<ColorRole, string>;

/** Named, built-in palettes. Each is a full ColorScheme (hex, no leading #). */
export const COLOR_SCHEMES: Record<string, ColorScheme> = {
  slate: {
    primary: "0B2545",
    primaryText: "FFFFFF",
    secondary: "3E7CB1",
    surface: "F2F4F7",
    muted: "5B6570",
    border: "C7CDD3",
  },
  navy: {
    primary: "14213D",
    primaryText: "FFFFFF",
    secondary: "FCA311",
    surface: "EEF1F6",
    muted: "52606D",
    border: "D0D6DE",
  },
  forest: {
    primary: "1B4332",
    primaryText: "FFFFFF",
    secondary: "95D5B2",
    surface: "EDF7F0",
    muted: "4A5D53",
    border: "CBE3D6",
  },
  crimson: {
    primary: "5B1A18",
    primaryText: "FFFFFF",
    secondary: "9C7A3C",
    surface: "F7F3EC",
    muted: "6B5E56",
    border: "E0D6C8",
  },
  teal: {
    primary: "1F4E5F",
    primaryText: "FFFFFF",
    secondary: "6FAFC4",
    surface: "EAF1F3",
    muted: "55676C",
    border: "CBDBE0",
  },
  violet: {
    primary: "3B2E5A",
    primaryText: "FFFFFF",
    secondary: "B497D6",
    surface: "F3EFFA",
    muted: "5E5570",
    border: "D9CFEA",
  },
  charcoal: {
    primary: "1A1A1A",
    primaryText: "FFFFFF",
    secondary: "8A8A8A",
    surface: "F5F5F3",
    muted: "6E6E6E",
    border: "DDDDDD",
  },
  sunset: {
    primary: "C1440E",
    primaryText: "FFFFFF",
    secondary: "F9A825",
    surface: "FFF3E8",
    muted: "6B584D",
    border: "F0D9BF",
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
export function recolor(
  value: unknown,
  roles: TemplateColorRoles,
  scheme: ColorScheme,
): unknown {
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
