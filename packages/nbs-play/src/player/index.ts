import {
  IInstrument,
  ILayer,
  INote,
  ISong,
  buildInstrument,
} from '../parser/index.js';

export interface IPlayLayer {
  layer: ILayer;
  notes: (INote | undefined)[];
}

export interface IPlayNote {
  instrument: number;
  velocity: number;
  panning: number;
  pitch: number;
}

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

export function buildPlayLayer(song: ISong): IPlayLayer[] {
  const playLayers: IPlayLayer[] = song.layers.map(
    (layer): IPlayLayer => ({
      layer,
      notes: new Array(song.header.songLength + 1).fill(undefined),
    })
  );
  for (let i = 0; i < song.notes.length; i += 1) {
    const note = song.notes[i];
    const layer = playLayers[note.layer];
    layer.notes[note.tick] = note;
  }
  return playLayers;
}

export class BasePlayer extends EventTarget {
  readonly builtinInstruments = BUILTIN_INSTRUMENTS;

  readonly instruments: IInstrument[];

  readonly layers: IPlayLayer[];

  playedTicks = 0;

  protected playTask?: any;

  protected lastTickTime = 0;

  get task() {
    return this.playTask;
  }

  get playing() {
    return !!this.playTask;
  }

  get ended() {
    return this.playedTicks >= this.length;
  }

  get length() {
    return this.song.header.songLength + 1;
  }

  constructor(public readonly song: ISong) {
    super();
    this.instruments = [
      ...this.builtinInstruments.slice(0, song.header.defaultInstruments),
      ...song.instruments,
    ];
    this.layers = buildPlayLayer(song);
  }

  public tick(): number {
    const now = Date.now();
    const delta = now - this.lastTickTime;
    this.lastTickTime = now;
    const passedTicks = (delta * this.song.header.tempo) / 1000;
    this.playedTicks += passedTicks;
    this.dispatchEvent(new Event('tick'));
    return passedTicks;
  }

  protected tickNotes(): IPlayNote[] {
    const lastTick = Math.ceil(this.playedTicks);
    this.tick();
    const currentTick = Math.ceil(this.playedTicks);
    if (lastTick === currentTick) return [];
    return this.layers.flatMap((layer) =>
      layer.notes
        .slice(lastTick, currentTick)
        .filter((note) => note)
        .map((note) => this.buildPlayNote(layer.layer, note!))
    );
  }

  protected async tickPlay() {
    await Promise.all(
      this.tickNotes().map((note) => this.playNote.bind(this)(note))
    );
    if (!this.playTask || this.ended) this.stopPlay();
  }

  protected buildPlayNote(layer: ILayer, note: INote): IPlayNote {
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, class-methods-use-this
  protected async playNote(note: IPlayNote) {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line class-methods-use-this
  protected async prepare(): Promise<any> {}

  protected async startTask() {
    if (this.playTask) return;
    await this.prepare();
    this.lastTickTime = Date.now();
    this.playTask = setInterval(this.tickPlay.bind(this), 1);
    this.dispatchEvent(new Event('play'));
  }

  protected stopTask() {
    if (this.playTask) {
      clearInterval(this.playTask);
      this.playTask = undefined;
    }
  }

  public resumePlay() {
    this.startTask();
  }

  public startPlay() {
    this.playedTicks = 0;
    this.startTask();
  }

  public pausePlay() {
    this.stopTask();
    this.dispatchEvent(new Event('stop'));
  }

  public stopPlay() {
    this.stopTask();
    this.playedTicks = 0;
    this.dispatchEvent(new Event('stop'));
  }
}

export default {};
