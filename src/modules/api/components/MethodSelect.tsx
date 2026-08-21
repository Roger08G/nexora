import { useEffect, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { HTTP_METHODS } from "@/modules/api/types";
import type { HttpMethod } from "@/modules/api/types";

type MethodSelectProps = {
    value: HttpMethod;
    onChange: (method: HttpMethod) => void;
};

export function MethodSelect({ value, onChange }: MethodSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("pointerdown", closeOnOutsidePointer);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [isOpen]);

    const selectMethod = (method: HttpMethod) => {
        onChange(method);
        setIsOpen(false);
    };

    return (
        <div className="method-select" data-method={value} ref={containerRef}>
            <span className="sr-only" id="http-method-label">
                Método HTTP
            </span>
            <button
                aria-controls="http-method-options"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-labelledby="http-method-label"
                className="method-select__trigger"
                onClick={() => setIsOpen((open) => !open)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setIsOpen(true);
                    }
                }}
                type="button"
            >
                <span>{value}</span>
                <FiChevronDown aria-hidden="true" />
            </button>

            {isOpen ? (
                <div
                    aria-labelledby="http-method-label"
                    className="method-select__menu"
                    id="http-method-options"
                    role="listbox"
                >
                    {HTTP_METHODS.map((method) => (
                        <button
                            aria-selected={method === value}
                            className="method-select__option"
                            data-method={method}
                            key={method}
                            onClick={() => selectMethod(method)}
                            role="option"
                            type="button"
                        >
                            {method}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
