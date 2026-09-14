type TextSelection = { value: string; start: number; end: number };
const TAB = "    ";

export function indentSelection(
    value: string,
    start: number,
    end: number,
    outdent: boolean,
): TextSelection {
    if (!outdent && start === end) {
        return {
            value: `${value.slice(0, start)}${TAB}${value.slice(end)}`,
            start: start + TAB.length,
            end: start + TAB.length,
        };
    }

    const firstLine = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
    const lastSelected = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const nextLine = value.indexOf("\n", lastSelected);
    const blockEnd = nextLine < 0 ? value.length : nextLine;
    const lines = value.slice(firstLine, blockEnd).split("\n");
    const edits: { position: number; removed: number; inserted: number }[] = [];
    let position = firstLine;
    const adjusted = lines
        .map((line) => {
            const removed = outdent
                ? line.startsWith("\t")
                    ? 1
                    : Math.min(line.match(/^ */)?.[0].length ?? 0, 4)
                : 0;
            edits.push({ position, removed, inserted: outdent ? 0 : TAB.length });
            position += line.length + 1;
            return outdent ? line.slice(removed) : TAB + line;
        })
        .join("\n");

    function moveOffset(offset: number) {
        let delta = 0;
        for (const edit of edits) {
            if (offset < edit.position) break;
            if (offset <= edit.position + edit.removed)
                return edit.position + delta + edit.inserted;
            delta += edit.inserted - edit.removed;
        }
        return offset + delta;
    }

    return {
        value: value.slice(0, firstLine) + adjusted + value.slice(blockEnd),
        start: moveOffset(start),
        end: moveOffset(end),
    };
}
