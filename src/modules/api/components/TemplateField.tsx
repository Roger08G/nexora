import { useState } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type TemplateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
    onValueChange: (value: string) => void;
    value: string;
};

export function TemplateInput({
    className = "",
    onScroll,
    onValueChange,
    value,
    ...props
}: TemplateInputProps) {
    const [scrollLeft, setScrollLeft] = useState(0);

    return (
        <span className={`template-field template-field--input ${className}`}>
            <span
                aria-hidden="true"
                className="template-field__render"
                style={{ transform: `translateX(${-scrollLeft}px)` }}
            >
                <TemplateMarkup value={value} />
            </span>
            <input
                {...props}
                onChange={(event) => onValueChange(event.target.value)}
                onScroll={(event) => {
                    setScrollLeft(event.currentTarget.scrollLeft);
                    onScroll?.(event);
                }}
                value={value}
            />
        </span>
    );
}

type TemplateTextareaProps = Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "onChange" | "value"
> & {
    onValueChange: (value: string) => void;
    value: string;
};

export function TemplateTextarea({
    className = "",
    onScroll,
    onValueChange,
    value,
    ...props
}: TemplateTextareaProps) {
    const [scroll, setScroll] = useState({ left: 0, top: 0 });

    return (
        <span className={`template-field template-field--textarea ${className}`}>
            <span
                aria-hidden="true"
                className="template-field__render"
                style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
            >
                <TemplateMarkup value={value} />
            </span>
            <textarea
                {...props}
                onChange={(event) => onValueChange(event.target.value)}
                onScroll={(event) => {
                    setScroll({
                        left: event.currentTarget.scrollLeft,
                        top: event.currentTarget.scrollTop,
                    });
                    onScroll?.(event);
                }}
                value={value}
            />
        </span>
    );
}

function TemplateMarkup({ value }: { value: string }) {
    if (!value) return <>&nbsp;</>;
    return value.split(/(\{\{[^{}]*}})/g).map((part, index) =>
        /^\{\{[^{}]+}}$/.test(part) ? (
            <mark className="template-variable" key={`${part}-${index}`}>
                {part}
            </mark>
        ) : (
            <span key={`${part}-${index}`}>{part}</span>
        ),
    );
}
