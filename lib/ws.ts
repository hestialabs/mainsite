/**
 * @file lib/ws.ts
 * @description WebSocket client for real-time device state streaming.
 * Connects to /ws/state with JWT query param authentication.
 * Implements auto-reconnect with exponential backoff.
 */

type WsCallback = (data: Record<string, unknown>) => void;

interface WsClientOptions {
    token: string;
    onMessage: WsCallback;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (err: Event) => void;
}

const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const PING_INTERVAL_MS = 25000;

export class WsClient {
    private socket: WebSocket | null = null;
    private reconnectDelay = INITIAL_DELAY_MS;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private destroyed = false;
    private readonly opts: WsClientOptions;

    constructor(opts: WsClientOptions) {
        this.opts = opts;
    }

    connect(): void {
        if (this.destroyed) return;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;
        const url = `${protocol}//${host}/ws/state?token=${encodeURIComponent(this.opts.token)}`;

        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
            this.reconnectDelay = INITIAL_DELAY_MS;
            this.opts.onConnect?.();
            this.startPing();
        };

        this.socket.onmessage = (event) => {
            if (event.data === "pong") return;
            try {
                const data = JSON.parse(event.data as string) as Record<string, unknown>;
                this.opts.onMessage(data);
            } catch {
                // Non-JSON message, ignore
            }
        };

        this.socket.onclose = () => {
            this.stopPing();
            this.opts.onDisconnect?.();
            this.scheduleReconnect();
        };

        this.socket.onerror = (err) => {
            this.opts.onError?.(err);
        };
    }

    disconnect(): void {
        this.destroyed = true;
        this.stopPing();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    private startPing(): void {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send("ping");
            }
        }, PING_INTERVAL_MS);
    }

    private stopPing(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.destroyed) return;
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_DELAY_MS);
    }
}
