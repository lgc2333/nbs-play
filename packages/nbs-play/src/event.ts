export interface IEventListener<TE extends Event = Event> {
  (evt: TE): void;
}

export interface IEventListenerObject<TE extends Event = Event> {
  handleEvent(object: TE): void;
}

export type TEvListenerFuncOrObj<TE extends Event = Event> =
  | IEventListener<TE>
  | IEventListenerObject<TE>;

export class PlayerEvent<T extends EventTarget, P = {}> extends Event {
  currentTarget!: T | null;

  target!: T | null;

  /** 事件额外参数 */
  readonly params: P;

  constructor(type: string, eventInitDict?: EventInit & P) {
    const { bubbles, cancelable, composed, ...rest } = eventInitDict || {};
    super(type, { bubbles, cancelable, composed });
    this.params = rest as P;
  }
}

export class PlayerEventTarget<
  T extends EventTarget,
  E extends { [key: string]: PlayerEvent<T> }
> extends EventTarget {
  public override addEventListener<K extends keyof E>(
    type: K,
    callback: TEvListenerFuncOrObj<E[K]> | null,
    options?: AddEventListenerOptions | boolean
  ): void {
    super.addEventListener(type as string, callback as any, options);
  }

  public override removeEventListener<K extends keyof E>(
    type: K,
    callback: TEvListenerFuncOrObj<E[K]> | null,
    options?: EventListenerOptions | boolean
  ): void {
    super.removeEventListener(type as string, callback as any, options);
  }
}
