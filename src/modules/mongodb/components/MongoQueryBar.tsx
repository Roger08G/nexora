import { FiPlay } from "react-icons/fi";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type MongoQueryBarProps = {
    filter: string;
    isLoading: boolean;
    limit: string;
    onFilterChange: (value: string) => void;
    onLimitChange: (value: string) => void;
    onProjectionChange: (value: string) => void;
    onRun: () => void;
    projection: string;
};

export function MongoQueryBar({
    filter,
    isLoading,
    limit,
    onFilterChange,
    onLimitChange,
    onProjectionChange,
    onRun,
    projection,
}: MongoQueryBarProps) {
    return (
        <div className="query-bar">
            <label className="query-field query-field--wide">
                <span>Filter</span>
                <input onChange={(event) => onFilterChange(event.target.value)} value={filter} />
            </label>
            <label className="query-field">
                <span>Project</span>
                <input
                    onChange={(event) => onProjectionChange(event.target.value)}
                    value={projection}
                />
            </label>
            <label className="query-field query-field--small">
                <span>Limit</span>
                <input onChange={(event) => onLimitChange(event.target.value)} value={limit} />
            </label>
            <ActionButton disabled={isLoading} icon={FiPlay} onClick={onRun} tone="primary">
                {isLoading ? "Consultando" : "Ejecutar"}
            </ActionButton>
        </div>
    );
}
