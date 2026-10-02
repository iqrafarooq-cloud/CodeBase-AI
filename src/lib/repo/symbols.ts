import ts from "typescript";
import type { SymbolInfo } from "@/lib/types";

export type ParsedFile = {
  symbols: SymbolInfo[];
  /** Raw import specifiers in source order (deduplicated). */
  imports: string[];
  hasDocComments: boolean;
  error?: string;
};

const TS_LANGS = new Set(["typescript", "tsx", "javascript", "jsx"]);

export function supportsSymbols(language: string) {
  return TS_LANGS.has(language) || language === "python";
}

export function parseSource(path: string, language: string, content: string): ParsedFile {
  try {
    if (TS_LANGS.has(language)) return parseTypeScript(path, language, content);
    if (language === "python") return parsePython(content);
  } catch (e) {
    return { symbols: [], imports: [], hasDocComments: false, error: e instanceof Error ? e.message.slice(0, 200) : "parse error" };
  }
  return { symbols: [], imports: [], hasDocComments: false };
}

function scriptKind(language: string) {
  switch (language) {
    case "tsx": return ts.ScriptKind.TSX;
    case "jsx": return ts.ScriptKind.JSX;
    case "javascript": return ts.ScriptKind.JS;
    default: return ts.ScriptKind.TS;
  }
}

function hasExport(node: ts.Node) {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function parseTypeScript(path: string, language: string, content: string): ParsedFile {
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKind(language));
  const isJsxFile = language === "tsx" || language === "jsx";
  const symbols: SymbolInfo[] = [];
  const imports = new Set<string>();
  const line = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const range = (node: ts.Node) => ({ line: line(node.getStart(sf, true)), endLine: line(node.getEnd()) });

  const push = (name: string, kind: SymbolInfo["kind"], node: ts.Node, exported: boolean) => {
    symbols.push({ name, kind, exported, ...range(node) });
  };

  for (const stmt of sf.statements) {
    const exported = hasExport(stmt);
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      imports.add(stmt.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      imports.add(stmt.moduleSpecifier.text);
    } else if (ts.isFunctionDeclaration(stmt)) {
      const name = stmt.name?.text ?? "default";
      const kind = isJsxFile && /^[A-Z]/.test(name) ? "component" : "function";
      push(name, kind, stmt, exported);
    } else if (ts.isClassDeclaration(stmt)) {
      push(stmt.name?.text ?? "default", "class", stmt, exported);
      for (const member of stmt.members) {
        if ((ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) && member.body) {
          const name = ts.isConstructorDeclaration(member) ? "constructor" : member.name.getText(sf);
          push(`${stmt.name?.text ?? "default"}.${name}`, "method", member, false);
        }
      }
    } else if (ts.isInterfaceDeclaration(stmt)) {
      push(stmt.name.text, "interface", stmt, exported);
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      push(stmt.name.text, "type", stmt, exported);
    } else if (ts.isEnumDeclaration(stmt)) {
      push(stmt.name.text, "enum", stmt, exported);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        const init = decl.initializer;
        const isFn = !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init) || isWrappedFunction(init));
        const kind: SymbolInfo["kind"] = isFn ? (isJsxFile && /^[A-Z]/.test(name) ? "component" : "function") : "variable";
        // Only keep variables that are exported or span multiple lines (config objects, schemas...).
        const r = range(stmt);
        if (kind === "variable" && !exported && r.endLine - r.line < 2) continue;
        push(name, kind, stmt.declarationList.declarations.length === 1 ? stmt : decl, exported);
      }
    } else if (ts.isExportAssignment(stmt)) {
      push("default", "variable", stmt, true);
    }
  }

  // require("x") and import("x") anywhere in the file
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression;
      if ((ts.isIdentifier(callee) && callee.text === "require") || callee.kind === ts.SyntaxKind.ImportKeyword) {
        imports.add(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return { symbols, imports: [...imports], hasDocComments: /\/\*\*[\s\S]*?\*\//.test(content) };
}

/** memo(() => ...), forwardRef(function X() {...}), etc. */
function isWrappedFunction(init: ts.Expression): boolean {
  if (!ts.isCallExpression(init)) return false;
  return init.arguments.some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
}

function indentOf(line: string) {
  return line.length - line.trimStart().length;
}

/** Indentation-based structural parser for Python (no runtime execution, no native deps). */
export function parsePython(content: string): ParsedFile {
  const lines = content.split("\n");
  const symbols: SymbolInfo[] = [];
  const imports = new Set<string>();
  const stack: { name: string; indent: number }[] = [];

  const blockEnd = (start: number, indent: number) => {
    let end = start;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim() || l.trimStart().startsWith("#")) continue;
      if (indentOf(l) <= indent) break;
      end = i;
    }
    return end + 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const trimmed = l.trimStart();
    const indent = indentOf(l);
    while (stack.length && stack[stack.length - 1].indent >= indent && trimmed) stack.pop();

    const imp = /^import\s+([\w.]+)/.exec(trimmed) ?? /^from\s+([\w.]+)\s+import\b/.exec(trimmed);
    if (imp && indent === 0) imports.add(imp[1]);

    const def = /^(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(trimmed);
    const cls = /^class\s+([A-Za-z_]\w*)/.exec(trimmed);
    if (!def && !cls) continue;

    // Include decorators directly above the definition.
    let start = i;
    while (start > 0 && lines[start - 1].trimStart().startsWith("@") && indentOf(lines[start - 1]) === indent) start--;
    const end = blockEnd(i, indent);
    const parentClass = stack.length ? stack[stack.length - 1].name : null;
    if (cls) {
      symbols.push({ name: cls[1], kind: "class", line: start + 1, endLine: end, exported: !cls[1].startsWith("_") && indent === 0 });
      stack.push({ name: cls[1], indent });
    } else if (def) {
      if (indent === 0) {
        symbols.push({ name: def[1], kind: "function", line: start + 1, endLine: end, exported: !def[1].startsWith("_") });
      } else if (parentClass) {
        symbols.push({ name: `${parentClass}.${def[1]}`, kind: "method", line: start + 1, endLine: end, exported: false });
      }
      stack.push({ name: def[1], indent });
    }
  }
  return { symbols, imports: [...imports], hasDocComments: /("""|''')/.test(content) };
}
