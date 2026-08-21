import { Toaster } from "sonner";

export function AppToaster() {
    return (
        <Toaster
            duration={2_800}
            gap={7}
            position="bottom-right"
            theme="dark"
            toastOptions={{ className: "nexora-toast" }}
            visibleToasts={3}
        />
    );
}
