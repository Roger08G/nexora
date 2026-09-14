import { describe, expect, test } from "bun:test";
import { formatJsonText } from "@/shared/components/code/json-format";

describe("JSON formatting without changing API data", () => {
    test("preserves large integers, exponents, negative zero and escapes", () => {
        const input = '{"id":9007199254740993,"value":1e400,"zero":-0,"text":"\\u0061"}';
        expect(formatJsonText(input)).toBe(
            '{\n    "id": 9007199254740993,\n    "value": 1e400,\n    "zero": -0,\n    "text": "\\u0061"\n}',
        );
    });

    test("formats nested values with four spaces and keeps empty containers compact", () => {
        const input = '{"list":[{"ok":true},null,[]],"empty":{},"text":"a,b:[c]"}';
        const formatted = formatJsonText(input);
        expect(formatted).toBe(JSON.stringify(JSON.parse(input), null, 4));
        expect(formatJsonText(formatted!)).toBe(formatted);
    });

    test("does not reformat invalid JSON or plain response text", () => {
        expect(formatJsonText('{"missing":}')).toBeNull();
        expect(formatJsonText("<html>error</html>")).toBeNull();
        expect(formatJsonText("")).toBeNull();
        expect(formatJsonText("0")).toBe("0");
    });

    test("does not expand deeply nested responses into excessive indentation", () => {
        const input = "[".repeat(1_000) + "0" + "]".repeat(1_000);
        expect(formatJsonText(input)).toBe(input);
    });
});
