import type { IconType } from "react-icons";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

type ModulePlaceholderProps = {
    description: string;
    icon: IconType;
    title: string;
};

export function ModulePlaceholder({ description, icon: Icon, title }: ModulePlaceholderProps) {
    return (
        <section className="module-page module-placeholder">
            <div className="module-placeholder__card">
                <div className="module-placeholder__icon">
                    <Icon aria-hidden="true" />
                </div>
                <StatusBadge tone="violet">Frontend preparado</StatusBadge>
                <h1>{title}</h1>
                <p>{description}</p>
                <small>La persistencia y las operaciones se conectarán al núcleo Rust.</small>
            </div>
        </section>
    );
}
