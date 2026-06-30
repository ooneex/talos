import type { ScalarType } from "@talosjs/types";
import type { IEvent, IEventClient } from "./types";

export abstract class RedisPubSub<Data extends Record<string, ScalarType> = Record<string, ScalarType>>
  implements IEvent<Data>
{
  constructor(protected readonly client: IEventClient<Data>) {}

  public abstract getChannel(): string | Promise<string>;
  public abstract handler(context: { data: Data; channel: string }): Promise<void> | void;

  public async publish(data: Data): Promise<void> {
    await this.client.publish({
      channel: await this.getChannel(),
      data,
    });
  }

  public async subscribe(): Promise<void> {
    await this.client.subscribe(await this.getChannel(), this.handler.bind(this));
  }

  public async unsubscribe(): Promise<void> {
    await this.client.unsubscribe(await this.getChannel());
  }

  public async unsubscribeAll(): Promise<void> {
    await this.client.unsubscribeAll();
  }
}
