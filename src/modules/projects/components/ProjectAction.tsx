import { FiArrowRight } from "react-icons/fi";
import type { IconType } from "react-icons";

type ProjectActionProps = {
    description: string;
    disabled: boolean;
    icon: IconType;
    label: string;
    onClick: () => void;
    tone: "primary" | "secondary";
};

export function ProjectAction({
    description,
    disabled,
    icon: Icon,
    label,
    onClick,
    tone,
}: ProjectActionProps) {
    return (
        <button
            className="project-action"
            data-tone={tone}
            disabled={disabled}
            onClick={onClick}
            type="button"
        >
            <span className="project-action__icon">
                <Icon aria-hidden="true" />
            </span>
            <span className="project-action__copy">
                <strong>{label}</strong>
                <small>{description}</small>
            </span>
            <FiArrowRight aria-hidden="true" className="project-action__arrow" />
        </button>
    );
}
