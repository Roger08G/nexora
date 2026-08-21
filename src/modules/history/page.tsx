import { FiClock } from "react-icons/fi";
import { ModulePlaceholder } from "@/shared/components/ui/ModulePlaceholder";

export function HistoryPage() {
    return (
        <ModulePlaceholder
            description="Aquí aparecerán las ejecuciones locales del proyecto, con búsqueda y repetición controlada."
            icon={FiClock}
            title="Historial"
        />
    );
}
