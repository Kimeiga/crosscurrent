/** Only the documented interfaces used by this application. Hosting injects the SDK. */
declare module '@appdeploy/client' {
  export const api: {
    get(path: string, data?: unknown): Promise<{ data: any }>;
    post(path: string, data?: unknown): Promise<{ data: any }>;
  };
  export interface WsConnection {
    connectionId: string | null;
    ready: Promise<void>;
    onMessage(fn: (message: any) => void): void;
    onOpen(fn: () => void): void;
    onClose(fn: () => void): void;
    onError(fn: (error: unknown) => void): void;
    disconnect(): void;
  }
  export const ws: { connect(): WsConnection };
}
declare module '@appdeploy/sdk' {
  export const db: import('../backend/rooms').Database;
  export const ws: { send(ids: string[], payload: unknown): Promise<unknown> };
  export function router(routes: Record<string, Array<(ctx: any) => Promise<unknown>>>): (event: unknown) => Promise<unknown>;
  export function json(value: unknown, status?: number): any;
  export function error(message: string, status?: number): any;
}
