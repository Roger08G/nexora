import { FiPlus, FiX } from "react-icons/fi";
import type { SavedRequest } from "@/modules/api/types";

type RequestTabsProps = {
    activeRequestId: string;
    onClose: (requestId: string) => void;
    onCreate: () => void;
    onSelect: (requestId: string) => void;
    requests: SavedRequest[];
};

export function RequestTabs({
    activeRequestId,
    onClose,
    onCreate,
    onSelect,
    requests,
}: RequestTabsProps) {
    return (
        <div className="request-tabs" role="tablist">
            {requests.map((request) => (
                <div
                    className="request-tab"
                    data-active={request.id === activeRequestId}
                    key={request.id}
                >
                    <button
                        aria-selected={request.id === activeRequestId}
                        className="request-tab__select"
                        onClick={() => onSelect(request.id)}
                        role="tab"
                        type="button"
                    >
                        <span className="method-label" data-method={request.method}>
                            {request.method}
                        </span>
                        <span>{request.name}</span>
                    </button>
                    <button
                        aria-label={`Cerrar ${request.name}`}
                        className="request-tab__close"
                        disabled={requests.length === 1}
                        onClick={() => onClose(request.id)}
                        type="button"
                    >
                        <FiX aria-hidden="true" />
                    </button>
                </div>
            ))}
            <button
                aria-label="Nueva ruta"
                className="request-tabs__new"
                onClick={onCreate}
                title="Nueva ruta"
                type="button"
            >
                <FiPlus aria-hidden="true" />
            </button>
        </div>
    );
}
