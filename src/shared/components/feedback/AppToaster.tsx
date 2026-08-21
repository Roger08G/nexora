import { Toaster } from "sonner";

export function AppToaster() {
    return (
        <Toaster
            closeButton
            duration={3_200}
            gap={9}
            position="bottom-right"
            richColors
            theme="dark"
            toastOptions={{ className: "nexora-toast" }}
            visibleToasts={4}
        />
    );
}
