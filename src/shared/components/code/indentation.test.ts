import { describe, expect, test } from "bun:test";
import { indentSelection } from "@/shared/components/code/indentation";

describe("code editor indentation", () => {
    test("Tab preserves selected code and indents each selected line", () => {
        const value = "{\n    a: 1,\n    b: 2\n}";
        const result = indentSelection(value, 2, value.indexOf("\n}"), false);
        expect(result.value).toBe("{\n        a: 1,\n        b: 2\n}");
        expect(result.value.slice(result.start, result.end)).toContain("a: 1,");
        expect(result.value.slice(result.start, result.end)).toContain("b: 2");
    });

    test("Shift+Tab removes one indent without deleting code", () => {
        const value = "    SELECT *\n\tFROM users;";
        const result = indentSelection(value, 0, value.length, true);
        expect(result.value).toBe("SELECT *\nFROM users;");
        expect(result.start).toBe(0);
        expect(result.end).toBe(result.value.length);
    });

    test("selection ending at the next line does not indent that next line", () => {
        expect(indentSelection("one\ntwo", 0, 4, false).value).toBe("    one\ntwo");
    });

    test("Tab inserts at the caret and unindent clamps a caret inside whitespace", () => {
        expect(indentSelection("abc", 1, 1, false)).toEqual({ value: "a    bc", start: 5, end: 5 });
        expect(indentSelection("    abc", 2, 2, true)).toEqual({ value: "abc", start: 0, end: 0 });
    });

    test("an empty first line remains part of a selection starting at zero", () => {
        expect(indentSelection("\nabc", 0, 4, false).value).toBe("    \n    abc");
    });

    test("outdent clamps a selection end within the last line's indentation", () => {
        expect(indentSelection("    one\n    two", 0, 10, true)).toEqual({
            value: "one\ntwo",
            start: 0,
            end: 4,
        });
    });
});
