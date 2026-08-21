import { FiPlay } from "react-icons/fi";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type MongoQueryBarProps = {
    filter: string;
    limit: string;
    onFilterChange: (value: string) => void;
    onLimitChange: (value: string) => void;
};

export function MongoQueryBar({
    filter,
    limit,
    onFilterChange,
    onLimitChange,
}: MongoQueryBarProps) {
    return (
        <div className="query-bar">
            <label className="query-field query-field--wide">
                <span>Filter</span>
                <input onChange={(event) => onFilterChange(event.target.value)} value={filter} />
            </label>
            <label className="query-field">
                <span>Project</span>
                <input defaultValue="{ name: 1, role: 1 }" />
            </label>
            <label className="query-field query-field--small">
                <span>Limit</span>
                <input onChange={(event) => onLimitChange(event.target.value)} value={limit} />
            </label>
            <ActionButton disabled icon={FiPlay} title="Driver MongoDB pendiente" tone="primary">
                Ejecutar
            </ActionButton>
        </div>
    );
}
