import { useCallback, useState } from "react";
import { AppShell } from "@/app/layouts/AppShell";
import { LoadingPage } from "@/modules/loading/page";

export default function App() {
    const [isLoading, setIsLoading] = useState(true);
    const finishLoading = useCallback(() => setIsLoading(false), []);

    return (
        <>
            <AppShell />
            {isLoading ? <LoadingPage onDone={finishLoading} /> : null}
        </>
    );
}
