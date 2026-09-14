const JSON_TOKENS = /"(?:\\.|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g;
const MAX_FORMATTED_LENGTH = 8 * 1_024 * 1_024;

/** Format whitespace only: parsing and serializing would round API integers and exponents. */
export function formatJsonText(value: string): string | null {
    try {
        JSON.parse(value);
    } catch {
        return null;
    }
    if (value.length > MAX_FORMATTED_LENGTH) return value;
    const tokens = value.match(JSON_TOKENS) ?? [];
    const lines: string[] = [];
    let depth = 0;
    let line = "";
    let formattedLength = 0;
    const append = (token: string) => {
        if (!line) line = "    ".repeat(depth);
        line += token;
    };
    const flush = () => {
        if (line) {
            lines.push(line);
            formattedLength += line.length + 1;
        }
        line = "";
    };
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token === "{" || token === "[") {
            const closing = token === "{" ? "}" : "]";
            append(token);
            if (tokens[index + 1] === closing) {
                append(closing);
                index++;
            } else {
                flush();
                depth++;
                if (depth > 64) return value;
            }
        } else if (token === "}" || token === "]") {
            flush();
            depth--;
            append(token);
        } else if (token === ",") {
            append(token);
            flush();
        } else if (token === ":") {
            append(": ");
        } else {
            append(token);
        }
        if (formattedLength + line.length > MAX_FORMATTED_LENGTH) return value;
    }
    flush();
    return lines.join("\n");
}
