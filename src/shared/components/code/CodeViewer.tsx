import { highlightLine, type CodeLanguage } from "@/shared/components/code/syntax";

type CodeViewerProps = {
    ariaLabel?: string;
    className?: string;
    language: CodeLanguage;
    value: string;
};

export function CodeViewer({
    ariaLabel = "Código",
    className = "",
    language,
    value,
}: CodeViewerProps) {
    const lines = normalizedLines(value);

    return (
        <div
            aria-label={ariaLabel}
            className={`code-viewer ${className}`}
            data-language={language}
            role="region"
        >
            {lines.map((line, index) => (
                <div className="code-viewer__line" key={index}>
                    <span aria-hidden="true" className="code-viewer__number">
                        {index + 1}
                    </span>
                    <code>{highlightLine(line, language)}</code>
                </div>
            ))}
        </div>
    );
}

function normalizedLines(value: string) {
    return value.replace(/\r\n?/g, "\n").split("\n");
}
