import type { ReactNode } from "react";

type SettingsFieldProps = {
    children: ReactNode;
    description: string;
    label: string;
};

export function SettingsField({ children, description, label }: SettingsFieldProps) {
    return (
        <div className="settings-field">
            <div>
                <strong>{label}</strong>
                <span>{description}</span>
            </div>
            {children}
        </div>
    );
}

type SettingsToggleProps = {
    checked: boolean;
    label: string;
    onChange: (checked: boolean) => void;
};

export function SettingsToggle({ checked, label, onChange }: SettingsToggleProps) {
    return (
        <label className="settings-toggle">
            <span className="sr-only">{label}</span>
            <input
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                type="checkbox"
            />
            <span aria-hidden="true" />
        </label>
    );
}
