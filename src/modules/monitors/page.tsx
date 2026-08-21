import { FiActivity } from "react-icons/fi";
import { ModulePlaceholder } from "@/shared/components/ui/ModulePlaceholder";

export function MonitorsPage() {
    return (
        <ModulePlaceholder
            description="Los monitores se diseñarán como ejecuciones locales explícitas, sin depender de servicios externos de Nexora."
            icon={FiActivity}
            title="Monitores locales"
        />
    );
}
