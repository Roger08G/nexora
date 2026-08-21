import type {
    HttpMethod,
    RequestCollection,
    RequestDraft,
    SavedRequest,
} from "@/modules/api/types";

export const HTTP_METHODS: readonly HttpMethod[] = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
];

export const DEMO_COLLECTIONS: readonly RequestCollection[] = [
    {
        id: "authentication",
        name: "Autenticación",
        requests: [
            {
                id: "login",
                collectionId: "authentication",
                method: "POST",
                name: "Iniciar sesión",
                path: "/v1/auth/login",
                body: '{\n  "email": "developer@nexora.local",\n  "password": "{{password}}"\n}',
            },
            {
                id: "refresh-token",
                collectionId: "authentication",
                method: "POST",
                name: "Renovar token",
                path: "/v1/auth/refresh",
            },
        ],
    },
    {
        id: "users",
        name: "Usuarios",
        requests: [
            {
                id: "list-users",
                collectionId: "users",
                method: "GET",
                name: "Listar usuarios",
                path: "/v1/users",
            },
            {
                id: "get-user",
                collectionId: "users",
                method: "GET",
                name: "Obtener usuario",
                path: "/v1/users/:id",
            },
            {
                id: "create-user",
                collectionId: "users",
                method: "POST",
                name: "Crear usuario",
                path: "/v1/users",
                body: '{\n  "name": "Ada Lovelace",\n  "role": "developer"\n}',
            },
            {
                id: "delete-user",
                collectionId: "users",
                method: "DELETE",
                name: "Eliminar usuario",
                path: "/v1/users/:id",
            },
        ],
    },
    {
        id: "projects",
        name: "Proyectos",
        requests: [
            {
                id: "list-projects",
                collectionId: "projects",
                method: "GET",
                name: "Listar proyectos",
                path: "/v1/projects",
            },
        ],
    },
] as const;

export const DEMO_REQUESTS = DEMO_COLLECTIONS.flatMap((collection) => collection.requests);

export function createDraft(request: SavedRequest): RequestDraft {
    return {
        method: request.method,
        url: `{{baseUrl}}${request.path}`,
        params:
            request.id === "list-users"
                ? [
                      { id: "limit", enabled: true, key: "limit", value: "20" },
                      { id: "role", enabled: false, key: "role", value: "developer" },
                  ]
                : [],
        headers: [
            { id: "accept", enabled: true, key: "Accept", value: "application/json" },
            {
                id: "authorization",
                enabled: true,
                key: "Authorization",
                value: "Bearer {{token}}",
            },
        ],
        body: request.body ?? "",
    };
}
