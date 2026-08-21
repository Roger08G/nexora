import nexoraLogo from "@tauri/icons/icon.png";

type NexoraMarkProps = {
    size?: number;
    className?: string;
};

export function NexoraMark({ size = 40, className }: NexoraMarkProps) {
    return (
        <img
            alt="Nexora"
            className={className}
            draggable={false}
            height={size}
            src={nexoraLogo}
            width={size}
        />
    );
}
