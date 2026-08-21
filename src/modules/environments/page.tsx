import { FiLayers } from "react-icons/fi";
import { ModulePlaceholder } from "@/shared/components/ui/ModulePlaceholder";

export function EnvironmentsPage() {
    return (
        <ModulePlaceholder
            description="Las variables versionables vivirán en el proyecto y los valores sensibles se resolverán desde el almacén seguro del sistema."
            icon={FiLayers}
            title="Entornos"
        />
    );
}
