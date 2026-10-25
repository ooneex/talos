import type { ContextType as ControllerContextType } from "@talosjs/controller";
import type { RequestConfigType } from "@talosjs/http-request";
import type { IResponse } from "@talosjs/http-response";
import type { ServerWebSocket } from "bun";

export type ControllerClassType = new (...args: any[]) => IController<any>;

export interface IController<T extends ContextConfigType = ContextConfigType> {
  /**
   * Return a response to have it validated and sent to this client, or return nothing
   * when the controller already answered through `context.channel`.
   */
  index: (context: ContextType<T>) => Promise<IResponse<T["response"]> | void> | IResponse<T["response"]> | void;
}

export type ContextConfigType = {
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
