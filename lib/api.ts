/**
 * @file lib/api.ts
 * @description Typed API client for the HxTP backend.
 * All calls go through Next.js rewrites → backend Fastify server.
 * Never duplicates backend logic. Never signs anything client-side.
 */

const BASE = "/api/v1";

let _csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
    _csrfToken = token;
}

interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    data: T;
}

interface ApiErrorBody {
    error: string;
    reason?: string;
}

class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly body: ApiErrorBody,
    ) {
        super(body.error);
        this.name = "ApiError";
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
    const url = `${BASE}${path}`;

    // Use Headers API for type-safe header management
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const method = init?.method?.toUpperCase() || "GET";
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method) && _csrfToken) {
        headers.set("X-CSRF-Token", _csrfToken);
    }

    const res = await fetch(url, {
        credentials: "include",
        ...init,
        headers,
    });

    let data: T;
    try {
        const text = await res.text();
        data = text ? JSON.parse(text) : ({} as T);
    } catch {
        data = {} as T;
    }

    if (!res.ok) {
        throw new ApiError(res.status, data as unknown as ApiErrorBody);
    }

    return { ok: true, status: res.status, data };
}

function withAuth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

// ── Session ──────────────────────────────────────────

export interface UserProfileResponse {
    authenticated: boolean;
    has_tenant: boolean;
    user: {
        id: string;
        supabase_id: string;
        email: string;
        role: string;
        tenant_id?: string;
    };
}

export async function getMe(token: string): Promise<ApiResponse<UserProfileResponse>> {
    return request<UserProfileResponse>("/auth/me", {
        headers: withAuth(token),
    });
}

export async function logout(): Promise<ApiResponse<{ status: string }>> {
    return request<{ status: string }>("/auth/logout", { method: "POST" });
}

export async function getCsrfToken(): Promise<ApiResponse<{ csrfToken: string }>> {
    return request<{ csrfToken: string }>("/auth/csrf");
}



// ── Devices ──────────────────────────────────────────

export interface Device {
    id: string;
    device_type: string;
    firmware: string;
    active: boolean;
    revoked: boolean;
    key_version: number;
    status?: string;
    last_heartbeat?: string;
    created_at: string;
    updated_at: string;
}

export interface DeviceListResponse {
    devices: Device[];
    count: number;
}

export interface RegisterDevicePayload {
    device_type: string;
    secret: string;
}

export async function listDevices(token: string): Promise<ApiResponse<DeviceListResponse>> {
    return request<DeviceListResponse>("/devices", {
        headers: withAuth(token),
    });
}

export async function registerDevice(
    token: string,
    payload: RegisterDevicePayload,
): Promise<ApiResponse<{ device_id: string }>> {
    return request<{ device_id: string }>("/device/register", {
        method: "POST",
        headers: withAuth(token),
        body: JSON.stringify(payload),
    });
}

export async function revokeDevice(
    token: string,
    deviceId: string,
): Promise<ApiResponse<{ device_id: string; status: string }>> {
    return request<{ device_id: string; status: string }>(`/device/${deviceId}/revoke`, {
        method: "POST",
        headers: withAuth(token),
    });
}

export async function rotateDeviceSecret(
    token: string,
    deviceId: string,
): Promise<ApiResponse<{ device_id: string; new_secret: string; key_version: number }>> {
    return request<{ device_id: string; new_secret: string; key_version: number }>(
        `/device/${deviceId}/rotate-secret`,
        {
            method: "POST",
            headers: withAuth(token),
        },
    );
}

export async function getKeyHistory(
    token: string,
    deviceId: string,
): Promise<
    ApiResponse<{
        device_id: string;
        current_version: number;
        history: Array<Record<string, unknown>>;
    }>
> {
    return request<{
        device_id: string;
        current_version: number;
        history: Array<Record<string, unknown>>;
    }>(`/device/${deviceId}/key-history`, {
        headers: withAuth(token),
    });
}

// ── Commands ─────────────────────────────────────────

export interface CommandPayload {
    action: string;
    params?: Record<string, unknown>;
}

export interface CommandResponse {
    status: string;
    command_id: string;
    message_id: string;
}

export async function sendCommand(
    token: string,
    deviceId: string,
    payload: CommandPayload,
): Promise<ApiResponse<CommandResponse>> {
    return request<CommandResponse>(`/device/${deviceId}/command`, {
        method: "POST",
        headers: withAuth(token),
        body: JSON.stringify(payload),
    });
}

export async function getCommandHistory(
    token: string,
    deviceId: string,
): Promise<ApiResponse<{ commands: Array<Record<string, unknown>> }>> {
    return request<{ commands: Array<Record<string, unknown>> }>(`/device/${deviceId}/commands`, {
        headers: withAuth(token),
    });
}

// ── Provisioning ─────────────────────────────────────

export interface ClaimPayload {
    public_key: string;
    device_type: string;
    signature: string;
    timestamp: string;
}

export interface ClaimResponse {
    device_id: string;
    encrypted_secret: {
        ephemeral_public_key: string;
        iv: string;
        tag: string;
        ciphertext: string;
    };
    key_version: number;
    protocol_version: string;
    mqtt_endpoint: string;
}

export async function claimDevice(
    token: string,
    payload: ClaimPayload,
): Promise<ApiResponse<ClaimResponse>> {
    return request<ClaimResponse>("/device/claim", {
        method: "POST",
        headers: withAuth(token),
        body: JSON.stringify(payload),
    });
}

// ── Firmware / OTA ───────────────────────────────────

export interface FirmwareCheckResponse {
    update_available: boolean;
    version?: string;
    checksum?: string;
    ed25519_signature?: string | null;
    download_url?: string | null;
}

export async function checkFirmware(
    token: string,
    params: { device_type: string; current_version: string; device_id?: string },
): Promise<ApiResponse<FirmwareCheckResponse>> {
    const qs = new URLSearchParams(params as Record<string, string>);
    return request<FirmwareCheckResponse>(`/firmware/check?${qs.toString()}`, {
        headers: withAuth(token),
    });
}

export async function uploadFirmware(
    token: string,
    formData: FormData,
): Promise<ApiResponse<{ version: string; device_type: string; checksum: string }>> {
    const res = await fetch(`${BASE}/firmware/upload`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });

    let data: { version: string; device_type: string; checksum: string };
    try {
        data = await res.json();
    } catch {
        data = { version: "", device_type: "", checksum: "" };
    }

    if (!res.ok) {
        throw new ApiError(res.status, data as unknown as ApiErrorBody);
    }

    return { ok: true, status: res.status, data };
}

// ── Admin ────────────────────────────────────────────

export interface TenantInfo {
    id: string;
    name: string;
    device_count?: number;
    created_at: string;
}

export async function listTenants(adminKey: string): Promise<ApiResponse<TenantInfo[]>> {
    return request<TenantInfo[]>("/admin/tenants", {
        headers: { "x-hxtp-admin-key": adminKey },
    });
}

export async function getAdminStats(adminKey: string): Promise<
    ApiResponse<{
        tenants_count: number;
        total_devices: number;
        status: string;
    }>
> {
    return request<{
        tenants_count: number;
        total_devices: number;
        status: string;
    }>("/admin/stats", {
        headers: { "x-hxtp-admin-key": adminKey },
    });
}

export async function sendInvite(
    adminKey: string,
    email: string,
): Promise<ApiResponse<{ token: string; link: string }>> {
    return request<{ token: string; link: string }>("/admin/invite", {
        method: "POST",
        headers: { "x-hxtp-admin-key": adminKey },
        body: JSON.stringify({ email }),
    });
}

export async function suspendTenant(
    adminKey: string,
    tenantId: string,
): Promise<ApiResponse<{ status: string; tenant_id: string }>> {
    return request<{ status: string; tenant_id: string }>(`/admin/tenant/${tenantId}/suspend`, {
        method: "POST",
        headers: { "x-hxtp-admin-key": adminKey },
    });
}

export async function setFeatureFlag(
    adminKey: string,
    flag: string,
    state: boolean,
): Promise<ApiResponse<{ flag: string; state: boolean }>> {
    return request<{ flag: string; state: boolean }>(`/admin/flag/${flag}`, {
        method: "POST",
        headers: { "x-hxtp-admin-key": adminKey },
        body: JSON.stringify({ state }),
    });
}

// ── Health ───────────────────────────────────────────

export interface HealthResponse {
    status: string;
    timestamp: string;
    checks: {
        database: boolean;
        redis: boolean;
        mqtt: boolean;
        protocol_ready: boolean;
    };
}

export async function getHealth(): Promise<ApiResponse<HealthResponse>> {
    const res = await fetch("/health", { credentials: "include" });
    const data = (await res.json()) as HealthResponse;
    return { ok: res.ok, status: res.status, data };
}

export async function getSystemStatus(): Promise<
    ApiResponse<{
        system: string;
        status: string;
        beta: boolean;
        version: string;
        protocol: string;
    }>
> {
    return request<{
        system: string;
        status: string;
        beta: boolean;
        version: string;
        protocol: string;
    }>("/status");
}

// ── Tenant Registration ──────────────────────────────

export interface TenantRegisterPayload {
    tenant_name: string;
}

export async function registerTenant(
    payload: TenantRegisterPayload,
): Promise<ApiResponse<{ tenant_id: string; user_id: string }>> {
    return request<{ tenant_id: string; user_id: string }>("/tenant/register", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export { ApiError };
