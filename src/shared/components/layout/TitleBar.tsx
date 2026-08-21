import { FiSearch } from "react-icons/fi";
import { useGlobalSearch } from "@/app/providers/GlobalSearchProvider";
import { NexoraMark } from "@/shared/components/brand/NexoraMark";

export function TitleBar() {
    const { openSearch } = useGlobalSearch();

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
                aria-label="Abrir búsqueda global"
                className="title-bar__search"
                onClick={openSearch}
                type="button"
            >
                <FiSearch aria-hidden="true" />
                <span>Buscar peticiones, colecciones y tablas</span>
                <kbd>Ctrl K</kbd>
            </button>
        </header>
    );
}
