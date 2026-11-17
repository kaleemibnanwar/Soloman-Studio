import {
  type CellPos,
  type SheetState,
  colIndexToLetters,
  lettersToColIndex,
  parseNumeric,
} from "./types";

export type FormulaValue = number | string | boolean;

export function isFormula(text: string): boolean {
  return text.startsWith("=") && text.length > 1;
}

export function isFormulaError(value: FormulaValue): boolean {
  return typeof value === "string" && /^#[A-Z0-9/!?]+$/.test(value);
}

export function formulaValueToDisplayString(value: FormulaValue): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "#NUM!";
  return value;
}

class FormulaError extends Error {}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "ref"; sheet: string | null; ref: string }
  | { kind: "range"; sheet: string | null; from: string; to: string }
  | { kind: "func"; name: string }
  | { kind: "ident"; name: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

const REF_PART = String.raw`\$?[A-Za-z]{1,3}\$?\d+`;
const SHEET_PREFIX = String.raw`(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_ ]*))!`;
const REF_RE = new RegExp(`^(?:${SHEET_PREFIX})?(${REF_PART})(?::(${REF_PART}))?`);

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      const end = formula.indexOf('"', i + 1);
      const stop = end === -1 ? formula.length : end;
      tokens.push({ kind: "str", value: formula.slice(i + 1, stop) });
      i = stop + 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i++;
      continue;
    }
    const twoChar = formula.slice(i, i + 2);
    if (twoChar === "<=" || twoChar === ">=" || twoChar === "<>") {
      tokens.push({ kind: "op", value: twoChar });
      i += 2;
      continue;
    }
    if ("+-*/^%&=<>".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    const rest = formula.slice(i);
    const refMatch = REF_RE.exec(rest);
    if (refMatch) {
      const [full, quotedSheet, bareSheet, from, to] = refMatch;
      const sheet = quotedSheet ?? bareSheet ?? null;
      const followedByParen = formula[i + full.length] === "(";
      if (!followedByParen) {
        tokens.push(to ? { kind: "range", sheet, from, to } : { kind: "ref", sheet, ref: from });
        i += full.length;
        continue;
      }
    }
    const numMatch = /^\d+(\.\d+)?/.exec(rest);
    if (numMatch) {
      tokens.push({ kind: "num", value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    const identMatch = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (identMatch) {
      const name = identMatch[0];
      i += name.length;
      let j = i;
      while (j < formula.length && /\s/.test(formula[j])) j++;
      if (formula[j] === "(") {
        tokens.push({ kind: "func", name: name.toUpperCase() });
      } else if (/^true$/i.test(name)) {
        tokens.push({ kind: "bool", value: true });
      } else if (/^false$/i.test(name)) {
        tokens.push({ kind: "bool", value: false });
      } else {
        tokens.push({ kind: "ident", name });
      }
      continue;
    }
    throw new FormulaError("#ERROR!");
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type Node =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "ref"; sheet: string | null; ref: string }
  | { type: "range"; sheet: string | null; from: string; to: string }
  | { type: "call"; name: string; args: Node[] }
  | { type: "unary"; op: string; arg: Node }
  | { type: "postfix"; op: string; arg: Node }
  | { type: "binary"; op: string; left: Node; right: Node };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new FormulaError("#ERROR!");
    this.pos++;
    return t;
  }

  parse(): Node {
    const node = this.parseComparison();
    if (this.pos < this.tokens.length) throw new FormulaError("#ERROR!");
    return node;
  }

  private parseComparison(): Node {
    let left = this.parseConcat();
    while (
      this.peek()?.kind === "op" &&
      ["=", "<>", "<", ">", "<=", ">="].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.next() as { value: string }).value;
      const right = this.parseConcat();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseConcat(): Node {
    let left = this.parseAdditive();
    while (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === "&") {
      this.next();
      const right = this.parseAdditive();
      left = { type: "binary", op: "&", left, right };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (
      this.peek()?.kind === "op" &&
      ["+", "-"].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.next() as { value: string }).value;
      const right = this.parseMultiplicative();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (
      this.peek()?.kind === "op" &&
      ["*", "/"].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.next() as { value: string }).value;
      const right = this.parseUnary();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (
      this.peek()?.kind === "op" &&
      ["-", "+"].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.next() as { value: string }).value;
      return { type: "unary", op, arg: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): Node {
    const base = this.parsePostfix();
    if (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === "^") {
      this.next();
      const exp = this.parseUnary();
      return { type: "binary", op: "^", left: base, right: exp };
    }
    return base;
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary();
    while (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === "%") {
      this.next();
      node = { type: "postfix", op: "%", arg: node };
    }
    return node;
  }

  private parsePrimary(): Node {
    const t = this.next();
    if (t.kind === "num") return { type: "num", value: t.value };
    if (t.kind === "str") return { type: "str", value: t.value };
    if (t.kind === "bool") return { type: "bool", value: t.value };
    if (t.kind === "ref") return { type: "ref", sheet: t.sheet, ref: t.ref };
    if (t.kind === "range") return { type: "range", sheet: t.sheet, from: t.from, to: t.to };
    if (t.kind === "lparen") {
      const inner = this.parseComparison();
      if (this.next()?.kind !== "rparen") throw new FormulaError("#ERROR!");
      return inner;
    }
    if (t.kind === "func") {
      const args: Node[] = [];
      if (this.next()?.kind !== "lparen") throw new FormulaError("#ERROR!");
      if (this.peek()?.kind !== "rparen") {
        args.push(this.parseComparison());
        while (this.peek()?.kind === "comma") {
          this.next();
          args.push(this.parseComparison());
        }
      }
      if (this.next()?.kind !== "rparen") throw new FormulaError("#ERROR!");
      return { type: "call", name: t.name, args };
    }
    throw new FormulaError("#NAME?");
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

interface EvalContext {
  getCell: (sheetName: string | null, row: number, col: number) => FormulaValue;
  getRange: (sheetName: string | null, from: CellPos, to: CellPos) => FormulaValue[][];
}

function toNumber(v: FormulaValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v.trim() === "") return 0;
  const n = parseNumeric(v);
  if (n == null) throw new FormulaError("#VALUE!");
  return n;
}

function toText(v: FormulaValue): string {
  return formulaValueToDisplayString(v);
}

function toBool(v: FormulaValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v.trim().toUpperCase() === "TRUE";
}

function flatten(values: FormulaValue[][]): FormulaValue[] {
  return values.flat();
}

function refRange(from: string, to: string): { from: CellPos; to: CellPos } {
  const a = parseRefStrict(from);
  const b = parseRefStrict(to);
  return {
    from: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    to: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

function parseRefStrict(ref: string): CellPos {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref);
  if (!match) throw new FormulaError("#REF!");
  return { col: lettersToColIndex(match[1]), row: Number(match[2]) - 1 };
}

function matchesCriteria(value: FormulaValue, criteria: FormulaValue): boolean {
  const c = toText(criteria).trim();
  const opMatch = /^(<=|>=|<>|<|>|=)(.*)$/.exec(c);
  if (opMatch) {
    const [, op, rest] = opMatch;
    const num = parseNumeric(rest);
    if (num != null && typeof value !== "boolean") {
      const v = toNumber(value);
      switch (op) {
        case "<=":
          return v <= num;
        case ">=":
          return v >= num;
        case "<>":
          return v !== num;
        case "<":
          return v < num;
        case ">":
          return v > num;
        case "=":
          return v === num;
      }
    }
    if (op === "<>") return toText(value).toLowerCase() !== rest.toLowerCase();
    if (op === "=") return toText(value).toLowerCase() === rest.toLowerCase();
    return false;
  }
  const num = parseNumeric(c);
  if (num != null && typeof value !== "boolean") return toNumber(value) === num;
  return toText(value).toLowerCase() === c.toLowerCase();
}

function evalNode(node: Node, ctx: EvalContext): FormulaValue {
  switch (node.type) {
    case "num":
      return node.value;
    case "str":
      return node.value;
    case "bool":
      return node.value;
    case "ref": {
      const pos = parseRefStrict(node.ref);
      return ctx.getCell(node.sheet, pos.row, pos.col);
    }
    case "range": {
      const { from, to } = refRange(node.from, node.to);
      const values = flatten(ctx.getRange(node.sheet, from, to));
      return values.length > 0 ? values[0] : "";
    }
    case "unary": {
      const v = toNumber(evalNode(node.arg, ctx));
      return node.op === "-" ? -v : v;
    }
    case "postfix": {
      const v = toNumber(evalNode(node.arg, ctx));
      return v / 100;
    }
    case "binary":
      return evalBinary(node, ctx);
    case "call":
      return evalCall(node, ctx);
  }
}

function evalBinary(node: Extract<Node, { type: "binary" }>, ctx: EvalContext): FormulaValue {
  if (node.op === "&") return toText(evalNode(node.left, ctx)) + toText(evalNode(node.right, ctx));
  const comparisonOps = ["=", "<>", "<", ">", "<=", ">="];
  if (comparisonOps.includes(node.op)) {
    const l = evalNode(node.left, ctx);
    const r = evalNode(node.right, ctx);
    const bothNumeric =
      (typeof l === "number" || (typeof l === "string" && parseNumeric(l) != null)) &&
      (typeof r === "number" || (typeof r === "string" && parseNumeric(r) != null));
    let cmp: number;
    if (bothNumeric) {
      const ln = toNumber(l);
      const rn = toNumber(r);
      cmp = ln < rn ? -1 : ln > rn ? 1 : 0;
    } else {
      const lt = toText(l).toLowerCase();
      const rt = toText(r).toLowerCase();
      cmp = lt < rt ? -1 : lt > rt ? 1 : 0;
    }
    switch (node.op) {
      case "=":
        return cmp === 0;
      case "<>":
        return cmp !== 0;
      case "<":
        return cmp < 0;
      case ">":
        return cmp > 0;
      case "<=":
        return cmp <= 0;
      case ">=":
        return cmp >= 0;
    }
  }
  const l = toNumber(evalNode(node.left, ctx));
  const r = toNumber(evalNode(node.right, ctx));
  switch (node.op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      if (r === 0) throw new FormulaError("#DIV/0!");
      return l / r;
    case "^":
      return l ** r;
  }
  throw new FormulaError("#ERROR!");
}

function argValues(args: Node[], ctx: EvalContext): FormulaValue[] {
  const out: FormulaValue[] = [];
  for (const arg of args) {
    if (arg.type === "range") {
      const { from, to } = refRange(arg.from, arg.to);
      out.push(...flatten(ctx.getRange(arg.sheet, from, to)));
    } else {
      out.push(evalNode(arg, ctx));
    }
  }
  return out;
}

function round(num: number, digits: number, mode: "nearest" | "up" | "down"): number {
  const factor = 10 ** digits;
  if (mode === "up")
    return (num >= 0 ? Math.ceil(num * factor) : Math.floor(num * factor)) / factor;
  if (mode === "down")
    return (num >= 0 ? Math.floor(num * factor) : Math.ceil(num * factor)) / factor;
  return Math.round(num * factor) / factor;
}

function evalCall(node: Extract<Node, { type: "call" }>, ctx: EvalContext): FormulaValue {
  const { name, args } = node;
  switch (name) {
    case "SUM":
      return argValues(args, ctx).reduce<number>(
        (sum, v) => sum + (parseNumeric(toText(v)) ?? (typeof v === "number" ? v : 0)),
        0,
      );
    case "AVERAGE": {
      const nums = argValues(args, ctx)
        .filter((v) => typeof v === "number" || (typeof v === "string" && parseNumeric(v) != null))
        .map(toNumber);
      if (nums.length === 0) throw new FormulaError("#DIV/0!");
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    case "COUNT":
      return argValues(args, ctx).filter(
        (v) =>
          typeof v === "number" ||
          (typeof v === "string" && v.trim() !== "" && parseNumeric(v) != null),
      ).length;
    case "COUNTA":
      return argValues(args, ctx).filter((v) => !(typeof v === "string" && v.trim() === "")).length;
    case "MIN": {
      const nums = argValues(args, ctx)
        .filter((v) => typeof v === "number" || (typeof v === "string" && parseNumeric(v) != null))
        .map(toNumber);
      return nums.length ? Math.min(...nums) : 0;
    }
    case "MAX": {
      const nums = argValues(args, ctx)
        .filter((v) => typeof v === "number" || (typeof v === "string" && parseNumeric(v) != null))
        .map(toNumber);
      return nums.length ? Math.max(...nums) : 0;
    }
    case "COUNTIF": {
      if (args.length !== 2 || args[0].type !== "range") throw new FormulaError("#VALUE!");
      const values = argValues([args[0]], ctx);
      const criteria = evalNode(args[1], ctx);
      return values.filter((v) => matchesCriteria(v, criteria)).length;
    }
    case "SUMIF": {
      if (args.length < 2 || args[0].type !== "range") throw new FormulaError("#VALUE!");
      const rangeValues = argValues([args[0]], ctx);
      const criteria = evalNode(args[1], ctx);
      const sumArg = args[2] ?? args[0];
      const sumValues = argValues([sumArg], ctx);
      let total = 0;
      for (let i = 0; i < rangeValues.length; i++) {
        if (matchesCriteria(rangeValues[i], criteria)) total += toNumber(sumValues[i] ?? 0);
      }
      return total;
    }
    case "IF": {
      const cond = toBool(evalNode(args[0], ctx));
      if (cond) return args[1] ? evalNode(args[1], ctx) : true;
      return args[2] ? evalNode(args[2], ctx) : false;
    }
    case "IFERROR": {
      try {
        const v = evalNode(args[0], ctx);
        if (isFormulaError(v)) return args[1] ? evalNode(args[1], ctx) : v;
        return v;
      } catch {
        return args[1] ? evalNode(args[1], ctx) : "#N/A";
      }
    }
    case "AND":
      return argValues(args, ctx).every((v) => toBool(v));
    case "OR":
      return argValues(args, ctx).some((v) => toBool(v));
    case "NOT":
      return !toBool(evalNode(args[0], ctx));
    case "CONCATENATE":
    case "CONCAT":
      return argValues(args, ctx).map(toText).join("");
    case "LEN":
      return toText(evalNode(args[0], ctx)).length;
    case "UPPER":
      return toText(evalNode(args[0], ctx)).toUpperCase();
    case "LOWER":
      return toText(evalNode(args[0], ctx)).toLowerCase();
    case "TRIM":
      return toText(evalNode(args[0], ctx)).trim();
    case "LEFT":
      return toText(evalNode(args[0], ctx)).slice(
        0,
        args[1] ? toNumber(evalNode(args[1], ctx)) : 1,
      );
    case "RIGHT": {
      const text = toText(evalNode(args[0], ctx));
      const n = args[1] ? toNumber(evalNode(args[1], ctx)) : 1;
      return n >= text.length ? text : text.slice(text.length - n);
    }
    case "MID": {
      const text = toText(evalNode(args[0], ctx));
      const start = toNumber(evalNode(args[1], ctx));
      const len = toNumber(evalNode(args[2], ctx));
      return text.slice(Math.max(0, start - 1), Math.max(0, start - 1) + len);
    }
    case "TEXT": {
      const value = evalNode(args[0], ctx);
      const format = args[1] ? toText(evalNode(args[1], ctx)) : "";
      const num = typeof value === "number" ? value : parseNumeric(toText(value));
      if (num == null) return toText(value);
      if (format.includes("%")) return `${round(num * 100, 2, "nearest")}%`;
      if (format.includes(".00")) return num.toFixed(2);
      if (format.includes("0")) return String(Math.round(num));
      return String(num);
    }
    case "ROUND":
      return round(
        toNumber(evalNode(args[0], ctx)),
        args[1] ? toNumber(evalNode(args[1], ctx)) : 0,
        "nearest",
      );
    case "ROUNDUP":
      return round(
        toNumber(evalNode(args[0], ctx)),
        args[1] ? toNumber(evalNode(args[1], ctx)) : 0,
        "up",
      );
    case "ROUNDDOWN":
      return round(
        toNumber(evalNode(args[0], ctx)),
        args[1] ? toNumber(evalNode(args[1], ctx)) : 0,
        "down",
      );
    case "ABS":
      return Math.abs(toNumber(evalNode(args[0], ctx)));
    case "SQRT": {
      const v = toNumber(evalNode(args[0], ctx));
      if (v < 0) throw new FormulaError("#NUM!");
      return Math.sqrt(v);
    }
    case "POWER":
      return toNumber(evalNode(args[0], ctx)) ** toNumber(evalNode(args[1], ctx));
    case "MOD": {
      const a = toNumber(evalNode(args[0], ctx));
      const b = toNumber(evalNode(args[1], ctx));
      if (b === 0) throw new FormulaError("#DIV/0!");
      return a - b * Math.floor(a / b);
    }
    case "INT":
      return Math.floor(toNumber(evalNode(args[0], ctx)));
    case "TODAY":
      return new Date().toISOString().slice(0, 10);
    case "NOW":
      return new Date().toISOString().slice(0, 16).replace("T", " ");
    case "VLOOKUP": {
      if (args.length < 3 || args[1].type !== "range") throw new FormulaError("#VALUE!");
      const lookup = evalNode(args[0], ctx);
      const { from, to } = refRange(args[1].from, args[1].to);
      const table = ctx.getRange(args[1].sheet, from, to);
      const colIndex = toNumber(evalNode(args[2], ctx));
      for (const row of table) {
        if (toText(row[0]).toLowerCase() === toText(lookup).toLowerCase()) {
          const cell = row[colIndex - 1];
          if (cell === undefined) throw new FormulaError("#REF!");
          return cell;
        }
      }
      throw new FormulaError("#N/A");
    }
    default:
      throw new FormulaError("#NAME?");
  }
}

function evaluateFormula(formula: string, ctx: EvalContext): FormulaValue {
  const tokens = tokenize(formula);
  const ast = new Parser(tokens).parse();
  return evalNode(ast, ctx);
}

// ---------------------------------------------------------------------------
// Workbook-wide evaluation with memoization + cycle detection
// ---------------------------------------------------------------------------

export function evaluateWorkbook(sheets: SheetState[]): Map<string, FormulaValue[][]> {
  const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s]));
  const memo = new Map<string, { computing: boolean; value: FormulaValue }>();
  const results = new Map<string, FormulaValue[][]>(
    sheets.map((s) => [s.id, s.grid.map((row) => row.map((): FormulaValue => ""))]),
  );

  function resolveSheet(sheetName: string | null, fallback: SheetState): SheetState | null {
    if (sheetName == null) return fallback;
    return byName.get(sheetName.toLowerCase()) ?? null;
  }

  function getCell(sheet: SheetState, row: number, col: number): FormulaValue {
    if (row < 0 || col < 0 || row >= sheet.grid.length || col >= (sheet.grid[0]?.length ?? 0))
      return "";
    const key = `${sheet.id}:${row}:${col}`;
    const cached = memo.get(key);
    if (cached) {
      if (cached.computing) return "#CIRCULAR!";
      return cached.value;
    }
    memo.set(key, { computing: true, value: "" });
    const raw = sheet.grid[row][col].text;
    let value: FormulaValue;
    if (isFormula(raw)) {
      try {
        value = evaluateFormula(raw.slice(1), {
          getCell: (sheetName, r, c) => {
            const target = resolveSheet(sheetName, sheet);
            if (!target) throw new FormulaError("#REF!");
            return getCell(target, r, c);
          },
          getRange: (sheetName, from, to) => {
            const target = resolveSheet(sheetName, sheet);
            if (!target) throw new FormulaError("#REF!");
            const rows: FormulaValue[][] = [];
            const maxRow = Math.min(to.row, target.grid.length - 1);
            const maxCol = Math.min(to.col, (target.grid[0]?.length ?? 1) - 1);
            for (let r = from.row; r <= maxRow; r++) {
              const rowValues: FormulaValue[] = [];
              for (let c = from.col; c <= maxCol; c++) rowValues.push(getCell(target, r, c));
              rows.push(rowValues);
            }
            return rows;
          },
        });
      } catch (err) {
        value = err instanceof FormulaError ? err.message : "#ERROR!";
      }
    } else {
      value = raw;
    }
    memo.set(key, { computing: false, value });
    const sheetResults = results.get(sheet.id);
    if (sheetResults) sheetResults[row][col] = value;
    return value;
  }

  for (const sheet of sheets) {
    for (let r = 0; r < sheet.grid.length; r++) {
      for (let c = 0; c < sheet.grid[r].length; c++) getCell(sheet, r, c);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Reference shifting, for fill-handle drag and formula-aware paste.
// ---------------------------------------------------------------------------

const SHIFT_REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?!\()/;

export function shiftFormulaRefs(formula: string, rowDelta: number, colDelta: number): string {
  if (rowDelta === 0 && colDelta === 0) return formula;
  let result = "";
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {
      const end = formula.indexOf('"', i + 1);
      const stop = end === -1 ? formula.length : end + 1;
      result += formula.slice(i, stop);
      i = stop;
      continue;
    }
    const prevChar = i > 0 ? formula[i - 1] : "";
    if (/[A-Za-z0-9_]/.test(prevChar)) {
      result += ch;
      i++;
      continue;
    }
    const match = SHIFT_REF_RE.exec(formula.slice(i));
    if (match) {
      const [full, colAbs, colLetters, rowAbs, rowDigits] = match;
      const newCol = colAbs
        ? colLetters
        : colIndexToLetters(Math.max(0, lettersToColIndex(colLetters) + colDelta));
      const newRow = rowAbs ? rowDigits : String(Math.max(1, Number(rowDigits) + rowDelta));
      result += `${colAbs}${newCol}${rowAbs}${newRow}`;
      i += full.length;
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}
