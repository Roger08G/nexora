import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { IconType } from "react-icons";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    icon?: IconType;
    tone?: "primary" | "secondary" | "ghost";
};

export function ActionButton({
    children,
    className = "",
    icon: Icon,
    tone = "secondary",
    type = "button",
    ...props
}: ActionButtonProps) {
    return (
        <button
            className={`action-button action-button--${tone} ${className}`}
            type={type}
            {...props}
        >
            {Icon ? <Icon aria-hidden="true" /> : null}
            <span>{children}</span>
        </button>
    );
}
