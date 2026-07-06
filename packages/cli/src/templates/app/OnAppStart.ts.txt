import { decorator, type IAppEventStart } from "@talosjs/app";
import type { Server } from "bun";

@decorator.app.event.start()
export class OnAppStart implements IAppEventStart {
  public handle(_server: Server<unknown>): void | Promise<void> {}
}
