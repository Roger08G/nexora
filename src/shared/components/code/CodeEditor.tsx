import { useRef, type KeyboardEvent, type UIEvent } from "react";
import { highlightLine, type CodeLanguage } from "@/shared/components/code/syntax";

type CodeEditorProps = {
    ariaLabel: string;
    autoFocus?: boolean;
    className?: string;
    language: CodeLanguage;
    onBlur?: () => void;
    onChange: (value: string) => void;
    value: string;
};

const TAB = "    ";

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
    const lines = value.replace(/\r\n?/g, "\n").split("\n");

    function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
        const { scrollLeft, scrollTop } = event.currentTarget;
        if (codeRef.current) {
            codeRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
        }
        if (gutterRef.current) {
            gutterRef.current.style.transform = `translateY(${-scrollTop}px)`;
        }
    }

    function insertTab(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key !== "Tab") return;
        event.preventDefault();
        const textarea = event.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const nextValue = `${value.slice(0, start)}${TAB}${value.slice(end)}`;
        onChange(nextValue);
        requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = start + TAB.length;
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
                            <span key={index}>{highlightLine(line, language)}</span>
                        ))}
                    </code>
                </pre>
                <textarea
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
