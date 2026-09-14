import { memo, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type UIEvent } from "react";
import { highlightLine, type CodeLanguage } from "@/shared/components/code/syntax";
import { indentSelection } from "@/shared/components/code/indentation";

type CodeEditorProps = {
    ariaLabel: string;
    autoFocus?: boolean;
    className?: string;
    language: CodeLanguage;
    onBlur?: () => void;
    onChange: (value: string) => void;
    value: string;
};

export function CodeEditor({
    ariaLabel,
    autoFocus = false,
    className = "",
    language,
    onBlur,
    onChange,
    value,
}: CodeEditorProps) {
    const codeRef = useRef<HTMLElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lines = useMemo(() => value.replace(/\r\n?/g, "\n").split("\n"), [value]);

    function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
        syncLayers(event.currentTarget);
    }

    function syncLayers({ scrollLeft, scrollTop }: HTMLTextAreaElement) {
        if (codeRef.current) {
            codeRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
        }
        if (gutterRef.current) {
            gutterRef.current.style.transform = `translateY(${-scrollTop}px)`;
        }
    }

    useLayoutEffect(() => {
        if (textareaRef.current) syncLayers(textareaRef.current);
    }, [value]);

    function insertTab(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key !== "Tab") return;
        event.preventDefault();
        const textarea = event.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const next = indentSelection(textarea.value, start, end, event.shiftKey);
        onChange(next.value);
        requestAnimationFrame(() => {
            if (textarea.isConnected && textarea.value === next.value) {
                textarea.setSelectionRange(next.start, next.end);
            }
        });
    }

    return (
        <div className={`syntax-editor ${className}`} data-language={language}>
            <div aria-hidden="true" className="syntax-editor__gutter">
                <div ref={gutterRef}>
                    {lines.map((_, index) => (
                        <span key={index}>{index + 1}</span>
                    ))}
                </div>
            </div>
            <div className="syntax-editor__body">
                <pre aria-hidden="true">
                    <code ref={codeRef}>
                        {lines.map((line, index) => (
                            <HighlightedEditorLine key={index} line={line} language={language} />
                        ))}
                    </code>
                </pre>
                <textarea
                    ref={textareaRef}
                    aria-label={ariaLabel}
                    autoFocus={autoFocus}
                    onBlur={onBlur}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={insertTab}
                    onScroll={syncScroll}
                    spellCheck={false}
                    value={value}
                />
            </div>
        </div>
    );
}

const HighlightedEditorLine = memo(function HighlightedEditorLine({
    line,
    language,
}: {
    line: string;
    language: CodeLanguage;
}) {
    return <span>{highlightLine(line, language)}</span>;
});
