import type { ReactNode } from "react";

type StatusBadgeProps = {
    children: ReactNode;
    tone?: "neutral" | "success" | "warning" | "danger" | "violet";
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
    return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
