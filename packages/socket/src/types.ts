import type { ContextType as ControllerContextType } from "@talosjs/controller";
import type { RequestConfigType } from "@talosjs/http-request";
import type { IResponse } from "@talosjs/http-response";
import type { ServerWebSocket } from "bun";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type ControllerClassType = new (...args: any[]) => IController<any>;

export interface IController<T extends ContextConfigType = ContextConfigType> {
  index: (context: ContextType<T>) => Promise<void> | void;
}

export type ContextConfigType = {
  // biome-ignore lint/suspicious/noExplicitAny: trust me
  response: Record<string, any>;
} & Partial<RequestConfigType>;

export type ContextType<T extends ContextConfigType = ContextConfigType> = ControllerContextType<T> & {
  channel: {
    ws: ServerWebSocket<T["response"]>;
    send: (response: IResponse<T["response"]>) => Promise<void>;
    close(code?: number, reason?: string): void;
    subscribe: () => Promise<void>;
    isSubscribed(): boolean;
    unsubscribe: () => Promise<void>;
    publish: (response: IResponse<T["response"]>) => Promise<void>;
  };
};
