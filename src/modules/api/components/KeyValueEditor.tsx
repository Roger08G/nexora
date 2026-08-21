import { FiCheck, FiPlus, FiTrash2 } from "react-icons/fi";
import type { KeyValueItem } from "@/modules/api/types";

type KeyValueEditorProps = {
    items: KeyValueItem[];
    onChange: (items: KeyValueItem[]) => void;
};

export function KeyValueEditor({ items, onChange }: KeyValueEditorProps) {
    function updateItem(itemId: string, patch: Partial<KeyValueItem>) {
        onChange(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
    }

    function addItem() {
        onChange([...items, { id: crypto.randomUUID(), enabled: true, key: "", value: "" }]);
    }

    return (
        <div className="key-value-editor">
            <div className="key-value-editor__header">
                <span className="sr-only">Activo</span>
                <span>Clave</span>
                <span>Valor</span>
                <span className="sr-only">Acciones</span>
            </div>
            <div className="key-value-editor__rows">
                {items.map((item) => (
                    <div className="key-value-row" data-enabled={item.enabled} key={item.id}>
                        <button
                            aria-checked={item.enabled}
                            aria-label={`Activar ${item.key || "fila"}`}
                            className="key-value-row__check"
                            onClick={() => updateItem(item.id, { enabled: !item.enabled })}
                            role="checkbox"
                            type="button"
                        >
                            <FiCheck aria-hidden="true" />
                        </button>
                        <input
                            aria-label="Clave"
                            onChange={(event) => updateItem(item.id, { key: event.target.value })}
                            placeholder="clave"
                            value={item.key}
                        />
                        <input
                            aria-label="Valor"
                            onChange={(event) => updateItem(item.id, { value: event.target.value })}
                            placeholder="valor"
                            value={item.value}
                        />
                        <button
                            aria-label={`Eliminar ${item.key || "fila"}`}
                            className="key-value-row__remove"
                            onClick={() =>
                                onChange(items.filter((candidate) => candidate.id !== item.id))
                            }
                            type="button"
                        >
                            <FiTrash2 aria-hidden="true" />
                        </button>
                    </div>
                ))}
                <button className="key-value-editor__add" onClick={addItem} type="button">
                    <FiPlus aria-hidden="true" />
                    Añadir fila
                </button>
            </div>
        </div>
    );
}
