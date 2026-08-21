const port = Number(process.argv[2]);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("El puerto E2E no es válido");
}

const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request: Request) {
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const headers = {
            "access-control-allow-headers": "authorization, content-type, x-nexora-test",
            "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
            "access-control-allow-origin": "*",
            "x-nexora-e2e": "webview",
        };

        if (url.pathname === "/health") {
            return Response.json({ ok: true, service: "nexora-e2e" }, { headers });
        }

        if (url.pathname === "/echo") {
            if (method === "HEAD") return new Response(null, { headers, status: 200 });
            if (method === "OPTIONS") return new Response(null, { headers, status: 204 });
            if (method === "DELETE") return new Response(null, { headers, status: 204 });

            const body = await readBody(request);
            return Response.json(
                {
                    authorization: request.headers.get("authorization"),
                    body,
                    method,
                    query: Object.fromEntries(url.searchParams),
                    testHeader: request.headers.get("x-nexora-test"),
                },
                { headers, status: method === "POST" ? 201 : 200 },
            );
        }

        return Response.json({ error: "not-found" }, { headers, status: 404 });
    },
});

console.log(`NEXORA_E2E_API_READY=${server.url.origin}`);

async function readBody(request: Request) {
    const text = await request.text();
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}
