import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeViewer } from "@/shared/components/code/CodeViewer";
import { highlightLine } from "@/shared/components/code/syntax";

function renderedText(node: ReactNode): string {
    if (Array.isArray(node)) return node.map(renderedText).join("");
    if (isValidElement<{ children?: ReactNode }>(node)) return renderedText(node.props.children);
    return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

describe("code rendering", () => {
    test("highlighting preserves exact whitespace and template cursor positions", () => {
        const json = '    "name": "{{userName}}", "method": "POST"';
        const sql = "\tSELECT \"user\", 12 FROM users WHERE name = 'Ana'; -- query";
        expect(renderedText(highlightLine(json, "json"))).toBe(json);
        expect(renderedText(highlightLine(sql, "sql"))).toBe(sql);
    });

    test("JSON and API response markup remains inert text", () => {
        const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
        const markup = renderToStaticMarkup(<CodeViewer language="text" value={payload} />);
        expect(markup).not.toContain("<img");
        expect(markup).not.toContain("<script");
        expect(markup).toContain("&lt;img");
        expect(markup).toContain("&lt;script&gt;");
    });

    test("long single-line JSON keeps every token and character", () => {
        const json = JSON.stringify(
            Object.fromEntries(
                Array.from({ length: 4_000 }, (_, index) => [`key${index}`, `value${index}`]),
            ),
        );
        expect(renderedText(highlightLine(json, "json"))).toBe(json);
    });
});
