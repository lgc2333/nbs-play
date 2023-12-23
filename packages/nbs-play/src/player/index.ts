import {
  IInstrument,
  ILayer,
  INote,
  ISong,
  buildInstrument,
} from '../parser/index.js';

/** note 播放参数 */
export interface IPlayNote {
  /** 乐器 id，与 {@link BasePlayer.instruments} 的 index 对应 */
  instrument: number;
  /** 音量，范围 `0` ~ `100` */
  velocity: number;
  /** 立体声位置，范围 `-100` ~ `100` */
  panning: number;
  /** 音调，`1` 为不变调 */
  pitch: number;
}

export type TPlayNoteLayer = IPlayNote[] | undefined;

/** 默认内置的音色列表 */
export const BUILTIN_INSTRUMENTS: IInstrument[] = [
  buildInstrument({ id: 0, name: 'Harp', file: 'harp.ogg' }),
  buildInstrument({ id: 1, name: 'Double Bass', file: 'dbass.ogg' }),
  buildInstrument({ id: 2, name: 'Bass Drum', file: 'bdrum.ogg' }),
  buildInstrument({ id: 3, name: 'Snare Drum', file: 'sdrum.ogg' }),
  buildInstrument({ id: 4, name: 'Click', file: 'click.ogg' }),
  buildInstrument({ id: 5, name: 'Guitar', file: 'guitar.ogg' }),
  buildInstrument({ id: 6, name: 'Flute', file: 'flute.ogg' }),
  buildInstrument({ id: 7, name: 'Bell', file: 'bell.ogg' }),
  buildInstrument({ id: 8, name: 'Chime', file: 'icechime.ogg' }),
  buildInstrument({ id: 9, name: 'Xylophone', file: 'xylobone.ogg' }),
  buildInstrument({
    id: 10,
    name: 'Iron Xylophone',
    file: 'iron_xylophone.ogg',
  }),
  buildInstrument({ id: 11, name: 'Cow Bell', file: 'cow_bell.ogg' }),
  buildInstrument({ id: 12, name: 'Didgeridoo', file: 'didgeridoo.ogg' }),
  buildInstrument({ id: 13, name: 'Bit', file: 'bit.ogg' }),
  buildInstrument({ id: 14, name: 'Banjo', file: 'banjo.ogg' }),
  buildInstrument({ id: 15, name: 'Pling', file: 'pling.ogg' }),
];

export class PlayerEvent<T = {}> extends Event {
  currentTarget!: BasePlayer | null;

  target!: BasePlayer | null;

  /** 事件额外参数 */
  readonly params: T;

  constructor(type: string, eventInitDict?: EventInit & T) {
    const { bubbles, cancelable, composed, ...rest } = eventInitDict || {};
    super(type, { bubbles, cancelable, composed });
    this.params = rest as T;
  }
}

export type TPlayerTickEvent = PlayerEvent<{ passedTicks: number }>;
export type TPlayerPlayEvent = PlayerEvent<{
  triggerType?: 'resume' | 'start';
}>;
export type TPlayerStopEvent = PlayerEvent<{
  triggerType?: 'pause' | 'stop' | 'ended';
}>;

export interface IEventListener<TE extends Event = Event> {
  (evt: TE): void;
}

export interface IEventListenerObject<TE extends Event = Event> {
  handleEvent(object: TE): void;
}

export type TEvListenerFuncOrObj<TE extends Event = Event> =
  | IEventListener<TE>
  | IEventListenerObject<TE>;

/** NBS 播放器基类 */
export abstract class BasePlayer extends EventTarget {
  /** 内置的音色列表，构建 {@link BasePlayer.instruments} 时使用 */
  public readonly builtinInstruments = BUILTIN_INSTRUMENTS;

  /** 乐器列表，index 与 {@link INote.instrument} 对应 */
  public readonly instruments: IInstrument[];

  /** 准备好的 note 播放参数列表，index 与 tick 对应 */
  public readonly playNotes: TPlayNoteLayer[];

  /** 已播放的 tick 数，内部计数用，不暴露 */
  protected playedTicksCounter = 0;

  /** 已播放的 note 数，内部计数用，不暴露 */
  protected playedNotesCounter = 0;

  /** 播放任务 */
  protected playTask?: NodeJS.Timeout | number;

  /** 上一次执行 {@link BasePlayer.tick} 的时间 */
  protected lastTickTime = 0;

  /** 是否正在播放 */
  public get playing() {
    return !!this.playTask;
  }

  /** 歌曲长度 (tick) */
  public get length() {
    return this.song.header.songLength + 1;
  }

  /** 歌曲 note 数 */
  public get noteLength() {
    return this.song.notes.length;
  }

  /** 是否已播放到结尾 */
  public get ended() {
    return this.playedTicksCounter >= this.length;
  }

  /** 已播放的 tick 数 */
  public get playedTicks() {
    return this.playedTicksCounter;
  }

  /** 已播放的 note 数 */
  public get playedNotes() {
    return this.playedNotesCounter;
  }

  constructor(public readonly song: ISong) {
    super();
    this.instruments = [
      ...this.builtinInstruments.slice(0, song.header.defaultInstruments),
      ...song.instruments,
    ];
    this.playNotes = this.buildPlayNotes(song);
  }

  /** 构建单个 {@link IPlayNote} */
  protected buildSinglePlayNote(layer: ILayer, note: INote): IPlayNote {
    const finalPanning = (note.panning + layer.panning) / 2;
    const finalKey =
      note.key +
      (this.instruments[note.instrument].pitch - 45) +
      note.pitch / 100;
    const finalPitch = 2 ** ((finalKey - 45) / 12);
    return {
      instrument: note.instrument,
      velocity: (note.velocity * layer.volume) / 100,
      panning: finalPanning,
      pitch: finalPitch,
    };
  }

  /** 构建 {@link IPlayNote} 列表 */
  protected buildPlayNotes(song: ISong): TPlayNoteLayer[] {
    const notes: TPlayNoteLayer[] = new Array(song.header.songLayers).fill(
      undefined
    );
    for (let i = 0; i < song.notes.length; i += 1) {
      const note = song.notes[i];
      const { tick } = note;
      const layer = this.song.layers[note.layer];
      if (notes[tick] === undefined) notes[tick] = [];
      notes[tick]!.push(this.buildSinglePlayNote(layer, note));
    }
    return notes;
  }

  /** 获取指定 tick 区间的 note */
  protected getNotesBetween(
    start: number,
    end: number
  ): IPlayNote[] | undefined {
    if (start === end && start > 0) return undefined;
    return this.playNotes
      .slice(start, end)
      .filter((v) => v)
      .flat() as IPlayNote[];
  }

  /** 根据已经过的时间自增已播放的 tick 数 */
  protected tick(): number {
    const now = Date.now();
    const delta = now - this.lastTickTime;
    this.lastTickTime = now;
    const passedTicks = (delta * this.song.header.tempo) / 1000;
    this.playedTicksCounter += passedTicks;
    this.dispatchEvent(new PlayerEvent('tick', { passedTicks }));
    return passedTicks;
  }

  /** 执行 {@link BasePlayer.tick} 后返回当前需要播放的 note 列表 */
  protected tickNotes(): IPlayNote[] | undefined {
    const lastTick = Math.ceil(this.playedTicksCounter);
    this.tick();
    const currentTick = Math.ceil(this.playedTicksCounter);
    return this.getNotesBetween(lastTick, currentTick);
  }

  /** 执行 {@link BasePlayer.tickNotes} 后执行播放 */
  protected async tickPlay() {
    if (!this.playing) {
      // await this.stopPlay();
      return;
    }
    const notes = this.tickNotes();
    if (notes) {
      await Promise.all(notes.map((note) => this.playNote.bind(this)(note)));
      this.playedNotesCounter += notes.length;
    }
    if (this.ended) {
      await this.stopPlay('ended');
    }
  }

  /** 播放单个 note */
  public abstract playNote(note: IPlayNote): Promise<any>;

  /** 播放前的准备工作 */
  // eslint-disable-next-line class-methods-use-this
  protected async prepare(): Promise<any> {}

  /** 启动播放任务，单独出来是为了方便继承类修改逻辑 */
  protected async startPlayTask() {
    this.playTask = setInterval(this.tickPlay.bind(this), 1);
  }

  /** 停止播放任务，单独出来是为了方便继承类修改逻辑 */
  protected async stopPlayTask() {
    clearInterval(this.playTask);
    this.playTask = undefined;
  }

  /** 开始或继续播放，给 public 方法调用 */
  protected async startPlay(triggerType?: string) {
    if (this.playing) throw new Error('Already playing');
    await this.prepare();
    this.lastTickTime = Date.now();
    await this.startPlayTask();
    this.dispatchEvent(new PlayerEvent('play', { triggerType }));
  }

  /** 暂停或停止播放，给 public 方法调用 */
  protected async stopPlay(triggerType?: string) {
    if (!this.playing) throw new Error('Not playing');
    await this.stopPlayTask();
    this.dispatchEvent(new PlayerEvent('stop', { triggerType }));
  }

  /** 调整播放进度 */
  public async seek(tick: number) {
    this.playedTicksCounter = tick;
    this.playedNotesCounter = this.getNotesBetween(0, tick)?.length || 0;
  }

  /** 继续播放 */
  public async resume() {
    if (this.ended) throw new Error('Already ended');
    await this.startPlay('resume');
  }

  /** 开始播放 */
  public async start() {
    this.playedTicksCounter = 0;
    await this.startPlay('start');
  }

  /** 暂停播放 */
  public async pause() {
    await this.stopPlay('pause');
  }

  /** 停止播放 */
  public async stop() {
    await this.stopPlay('stop');
    this.playedTicksCounter = 0;
  }

  public addEventListener(
    type: 'tick',
    callback: TEvListenerFuncOrObj<TPlayerTickEvent> | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  public addEventListener(
    type: 'play',
    callback: TEvListenerFuncOrObj<TPlayerPlayEvent> | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  public addEventListener(
    type: 'stop',
    callback: TEvListenerFuncOrObj<TPlayerStopEvent> | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  public addEventListener(
    type: string,
    callback: TEvListenerFuncOrObj | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void {
    super.addEventListener(type, callback, options);
  }
}
