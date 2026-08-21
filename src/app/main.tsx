import ReactDOM from "react-dom/client";
import App from "@/app/App";
import "@/shared/index.css";

async function bootstrap() {
    if (import.meta.env.MODE === "e2e") await import("@wdio/tauri-plugin");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
}

void bootstrap();
