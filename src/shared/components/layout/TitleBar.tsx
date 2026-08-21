import { FiSearch } from "react-icons/fi";
import { NexoraMark } from "@/shared/components/brand/NexoraMark";

export function TitleBar() {
    return (
        <header className="title-bar">
            <div className="title-bar__brand">
                <NexoraMark size={36} />
                <div>
                    <strong>Nexora</strong>
                    <span>Backend workspace</span>
                </div>
            </div>

            <button
                aria-label="Búsqueda global pendiente de implementación"
                className="title-bar__search"
                disabled
                type="button"
            >
                <FiSearch aria-hidden="true" />
                <span>Buscar peticiones, colecciones y tablas</span>
                <kbd>Ctrl K</kbd>
            </button>
        </header>
    );
}
