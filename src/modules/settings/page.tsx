import { FiRefreshCw, FiSettings } from "react-icons/fi";
import { toast } from "sonner";
import { useAppSettings } from "@/app/providers/AppSettingsProvider";
import { SettingsField, SettingsToggle } from "@/modules/settings/components/SettingsField";
import { ActionButton } from "@/shared/components/ui/ActionButton";

export function SettingsPage() {
    const { resetSettings, settings, updateSettings } = useAppSettings();

    function update(changes: Parameters<typeof updateSettings>[0], message: string) {
        updateSettings(changes);
        toast.success(message, { id: "settings-updated" });
    }

    return (
        <section className="module-page settings-page">
            <div className="settings-shell">
                <header className="settings-header">
                    <span>
                        <FiSettings aria-hidden="true" />
                    </span>
                    <div>
                        <h1>Ajustes</h1>
                        <p>Preferencias locales de Nexora. No se guardan dentro del proyecto.</p>
                    </div>
                </header>

                <section className="settings-card">
                    <header>
                        <h2>Peticiones HTTP</h2>
                        <p>Controla el guardado y los límites del cliente API.</p>
                    </header>
                    <SettingsField
                        description="Guarda los cambios después de editar y antes de cambiar de pestaña."
                        label="Guardado automático"
                    >
                        <SettingsToggle
                            checked={settings.autoSaveRequests}
                            label="Guardado automático"
                            onChange={(autoSaveRequests) =>
                                update(
                                    { autoSaveRequests },
                                    autoSaveRequests
                                        ? "Guardado automático activado"
                                        : "Guardado automático desactivado",
                                )
                            }
                        />
                    </SettingsField>
                    <SettingsField
                        description="Tiempo de espera tras el último cambio antes de escribir en requests/."
                        label="Espera de autosave"
                    >
                        <label className="settings-select">
                            <span className="sr-only">Espera de autosave</span>
                            <select
                                aria-label="Espera de autosave"
                                disabled={!settings.autoSaveRequests}
                                onChange={(event) =>
                                    update(
                                        { autoSaveDelayMs: Number(event.target.value) },
                                        "Tiempo de autosave actualizado",
                                    )
                                }
                                value={settings.autoSaveDelayMs}
                            >
                                <option value={400}>400 ms</option>
                                <option value={800}>800 ms</option>
                                <option value={1500}>1,5 s</option>
                                <option value={3000}>3 s</option>
                            </select>
                        </label>
                    </SettingsField>
                    <SettingsField
                        description="Nexora cancelará la petición si el servidor no responde a tiempo."
                        label="Timeout de petición"
                    >
                        <label className="settings-number">
                            <input
                                aria-label="Timeout HTTP en segundos"
                                max={120}
                                min={1}
                                onChange={(event) =>
                                    updateSettings({
                                        requestTimeoutMs: Number(event.target.value) * 1_000,
                                    })
                                }
                                onBlur={() =>
                                    toast.success("Timeout HTTP actualizado", {
                                        id: "settings-updated",
                                    })
                                }
                                type="number"
                                value={settings.requestTimeoutMs / 1_000}
                            />
                            <span>segundos</span>
                        </label>
                    </SettingsField>
                </section>

                <section className="settings-card">
                    <header>
                        <h2>Seguridad local</h2>
                        <p>Protecciones para operaciones que modifican datos.</p>
                    </header>
                    <SettingsField
                        description="Solicita confirmación antes de borrar documentos o ejecutar SQL de escritura."
                        label="Confirmar acciones destructivas"
                    >
                        <SettingsToggle
                            checked={settings.confirmDestructiveActions}
                            label="Confirmar acciones destructivas"
                            onChange={(confirmDestructiveActions) =>
                                update(
                                    { confirmDestructiveActions },
                                    confirmDestructiveActions
                                        ? "Confirmaciones de seguridad activadas"
                                        : "Confirmaciones de seguridad desactivadas",
                                )
                            }
                        />
                    </SettingsField>
                </section>

                <footer className="settings-footer">
                    <div>
                        <strong>Restablecer preferencias</strong>
                        <span>Vuelve a los valores recomendados de Nexora.</span>
                    </div>
                    <ActionButton
                        icon={FiRefreshCw}
                        onClick={() => {
                            resetSettings();
                            toast.success("Ajustes restablecidos", { id: "settings-updated" });
                        }}
                        tone="ghost"
                    >
                        Restablecer
                    </ActionButton>
                </footer>
            </div>
        </section>
    );
}
