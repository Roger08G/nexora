import { FiSettings } from "react-icons/fi";
import { ModulePlaceholder } from "@/shared/components/ui/ModulePlaceholder";

export function SettingsPage() {
    return (
        <ModulePlaceholder
            description="Preferencias del usuario, límites de seguridad y configuración de la aplicación."
            icon={FiSettings}
            title="Ajustes"
        />
    );
}
