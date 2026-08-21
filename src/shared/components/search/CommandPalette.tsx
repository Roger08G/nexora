import { useEffect, useMemo, useState } from "react";
import { FiCommand, FiCornerDownLeft, FiSearch } from "react-icons/fi";
import { useGlobalSearch } from "@/app/providers/GlobalSearchProvider";

const MAX_RESULTS = 12;

export function CommandPalette() {
    const { closeSearch, isOpen, items, selectItem } = useGlobalSearch();
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    const results = useMemo(() => {
        const normalizedQuery = normalize(query);
        const filtered = normalizedQuery
            ? items.filter((item) =>
                  normalize(`${item.title} ${item.description} ${item.keywords ?? ""}`).includes(
                      normalizedQuery,
                  ),
              )
            : items;
        return filtered.slice(0, MAX_RESULTS);
    }, [items, query]);

    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setSelectedIndex(0);
        }
    }, [isOpen]);

    useEffect(() => {
        setSelectedIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
    }, [results.length]);

    if (!isOpen) return null;

    return (
        <div
            className="command-palette-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeSearch();
            }}
            role="presentation"
        >
            <section
                aria-label="Búsqueda global"
                aria-modal="true"
                className="command-palette"
                role="dialog"
            >
                <div className="command-palette__input">
                    <FiSearch aria-hidden="true" />
                    <input
                        aria-label="Buscar en Nexora"
                        autoFocus
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setSelectedIndex(0);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setSelectedIndex((current) =>
                                    Math.min(results.length - 1, current + 1),
                                );
                            } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setSelectedIndex((current) => Math.max(0, current - 1));
                            } else if (event.key === "Enter" && results[selectedIndex]) {
                                event.preventDefault();
                                selectItem(results[selectedIndex]);
                            }
                        }}
                        placeholder="Buscar peticiones, colecciones, tablas o módulos…"
                        spellCheck={false}
                        value={query}
                    />
                    <kbd>Esc</kbd>
                </div>
                <div className="command-palette__results">
                    {results.map((item, index) => {
                        const Icon = item.icon;
                        return (
                            <button
                                data-selected={index === selectedIndex}
                                key={item.id}
                                onClick={() => selectItem(item)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                type="button"
                            >
                                <span className="command-palette__icon">
                                    <Icon aria-hidden="true" />
                                </span>
                                <span className="command-palette__copy">
                                    <strong>{item.title}</strong>
                                    <small>{item.description}</small>
                                </span>
                                <span className="command-palette__group">{item.group}</span>
                                {index === selectedIndex ? (
                                    <FiCornerDownLeft
                                        aria-hidden="true"
                                        className="command-palette__enter"
                                    />
                                ) : null}
                            </button>
                        );
                    })}
                    {results.length === 0 ? (
                        <div className="command-palette__empty">
                            <FiCommand aria-hidden="true" />
                            <strong>Sin resultados</strong>
                            <span>Prueba con otro nombre, ruta o módulo.</span>
                        </div>
                    ) : null}
                </div>
                <footer>
                    <span>↑↓ Navegar</span>
                    <span>↵ Abrir</span>
                    <span>Esc Cerrar</span>
                </footer>
            </section>
        </div>
    );
}

function normalize(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
