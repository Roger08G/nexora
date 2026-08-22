import type { ReactNode } from "react";

export type CodeLanguage = "json" | "sql" | "text";

type TokenKind =
    | "boolean"
    | "comment"
    | "identifier"
    | "key"
    | "keyword"
    | "null"
    | "number"
    | "operator"
    | "punctuation"
    | "string"
    | "template";

const SQL_KEYWORDS = new Set(
    [
        "ALL",
        "ALTER",
        "AND",
        "AS",
        "ASC",
        "BEGIN",
        "BETWEEN",
        "BY",
        "CASE",
        "COMMIT",
        "CREATE",
        "DELETE",
        "DESC",
        "DISTINCT",
        "DROP",
        "ELSE",
        "END",
        "EXISTS",
        "FALSE",
        "FROM",
        "FULL",
        "GROUP",
        "HAVING",
        "IN",
        "INNER",
        "INSERT",
        "INTO",
        "IS",
        "JOIN",
        "LEFT",
        "LIKE",
        "LIMIT",
        "NOT",
        "NULL",
        "OFFSET",
        "ON",
        "OR",
        "ORDER",
        "OUTER",
        "RETURNING",
        "RIGHT",
        "ROLLBACK",
        "SELECT",
        "SET",
        "TABLE",
        "THEN",
        "TRUE",
        "UNION",
        "UPDATE",
        "VALUES",
        "WHEN",
        "WHERE",
        "WITH",
    ].map((keyword) => keyword.toUpperCase()),
);

const JSON_TOKEN =
    /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;
const SQL_TOKEN =
    /--.*$|\/\*.*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_$]*\b|::|<=|>=|<>|!=|[(),.;=*<>+\/-]/g;

export function highlightLine(line: string, language: CodeLanguage): ReactNode[] {
    if (language === "text" || line.length === 0) return [line || " "];
    return tokenize(line, language === "json" ? JSON_TOKEN : SQL_TOKEN, (token, end) =>
        language === "json" ? jsonTokenKind(line, token, end) : sqlTokenKind(token),
    );
}

function tokenize(
    line: string,
    expression: RegExp,
    classify: (token: string, end: number) => TokenKind,
) {
    const nodes: ReactNode[] = [];
    const regex = new RegExp(expression.source, expression.flags);
    let cursor = 0;
    let tokenIndex = 0;
    for (const match of line.matchAll(regex)) {
        const index = match.index ?? 0;
        if (index > cursor) nodes.push(...templateNodes(line.slice(cursor, index), tokenIndex++));
        const token = match[0];
        const kind = classify(token, index + token.length);
        nodes.push(
            <span className={`syntax-token syntax-token--${kind}`} key={tokenIndex++}>
                {templateNodes(token, tokenIndex++)}
            </span>,
        );
        cursor = index + token.length;
    }
    if (cursor < line.length) nodes.push(...templateNodes(line.slice(cursor), tokenIndex++));
    return nodes;
}

function templateNodes(value: string, key: number): ReactNode[] {
    return value.split(/(\{\{[^{}]+}})/g).map((part, index) =>
        /^\{\{[^{}]+}}$/.test(part) ? (
            <span className="syntax-token syntax-token--template" key={`${key}-${index}`}>
                {part}
            </span>
        ) : (
            part
        ),
    );
}

function jsonTokenKind(line: string, token: string, end: number): TokenKind {
    if (token.startsWith('"'))
        return line.slice(end).trimStart().startsWith(":") ? "key" : "string";
    if (token === "true" || token === "false") return "boolean";
    if (token === "null") return "null";
    if (/^-?\d/.test(token)) return "number";
    return "punctuation";
}

function sqlTokenKind(token: string): TokenKind {
    if (token.startsWith("--") || token.startsWith("/*")) return "comment";
    if (token.startsWith("'") || token.startsWith('"')) return "string";
    if (/^\d/.test(token)) return "number";
    if (/^[A-Za-z_]/.test(token)) {
        const normalized = token.toUpperCase();
        if (normalized === "TRUE" || normalized === "FALSE") return "boolean";
        if (normalized === "NULL") return "null";
        return SQL_KEYWORDS.has(normalized) ? "keyword" : "identifier";
    }
    return token === "," || token === ";" || token === "." || token === "(" || token === ")"
        ? "punctuation"
        : "operator";
}
