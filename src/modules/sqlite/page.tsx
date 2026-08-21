import { useState } from "react";
import { DatabaseTree } from "@/modules/sqlite/components/DatabaseTree";
import { SqlWorkbench } from "@/modules/sqlite/components/SqlWorkbench";
import { DEFAULT_SQL, DEMO_TABLES } from "@/modules/sqlite/data/sqlite.fixtures";

export function SqlitePage() {
    const [selectedTable, setSelectedTable] = useState("requests");
    const [sql, setSql] = useState(DEFAULT_SQL);

    return (
        <section className="module-page sqlite-page">
            <DatabaseTree
                onSelect={setSelectedTable}
                selectedTable={selectedTable}
                tables={DEMO_TABLES}
            />
            <SqlWorkbench onSqlChange={setSql} selectedTable={selectedTable} sql={sql} />
        </section>
    );
}
