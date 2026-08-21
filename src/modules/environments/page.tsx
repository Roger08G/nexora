import { useSessionVariables } from "@/app/providers/SessionVariablesProvider";
import { SessionVariablesEditor } from "@/modules/environments/components/SessionVariablesEditor";

export function EnvironmentsPage() {
    const { addVariable, removeVariable, updateVariable, variables } = useSessionVariables();

    return (
        <section className="module-page variables-page">
            <SessionVariablesEditor
                onAdd={addVariable}
                onRemove={removeVariable}
                onUpdate={updateVariable}
                variables={variables}
            />
        </section>
    );
}
