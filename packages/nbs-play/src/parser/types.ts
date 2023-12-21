const CURRENT_NBS_VERSION = 5;

export interface IInstrument {
  id: number;
  name: string;
  file: string;
  pitch: number;
  pressKey: boolean;
}

export interface INote {
  tick: number;
  layer: number;
  instrument: number;
  key: number;
  velocity: number;
  panning: number;
  pitch: number;
}

export interface ILayer {
  id: number;
  name: string;
  lock: boolean;
  volume: number;
  panning: number;
}

export interface IHeader {
  version: number;
  defaultInstruments: number;
  songLength: number;
  songLayers: number;
  songName: string;
  songAuthor: string;
  originalAuthor: string;
  description: string;
  tempo: number;
  autoSave: boolean;
  autoSaveDuration: number;
  timeSignature: number;
  minutesSpent: number;
  leftClicks: number;
  rightClicks: number;
  blocksAdded: number;
  blocksRemoved: number;
  songOrigin: string;
  loop: boolean;
  maxLoopCount: number;
  loopStart: number;
}

export interface ISong {
  header: IHeader;
  notes: INote[];
  layers: ILayer[];
  instruments: IInstrument[];
}

export type WithOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export function buildInstrument(
  data: WithOptional<IInstrument, 'pitch' | 'pressKey'>
): IInstrument {
  return { pitch: 45, pressKey: true, ...data };
}

export function buildNote(
  data: WithOptional<INote, 'velocity' | 'panning' | 'pitch'>
): INote {
  return { velocity: 100, panning: 0, pitch: 0, ...data };
}

export function buildLayer(
  data: WithOptional<ILayer, 'lock' | 'volume' | 'panning'>
): ILayer {
  return { lock: false, volume: 100, panning: 0, ...data };
}

export function buildHeader(data: Partial<IHeader>): IHeader {
  return {
    version: CURRENT_NBS_VERSION,
    defaultInstruments: 16,
    songLength: 0,
    songLayers: 0,
    songName: '',
    songAuthor: '',
    originalAuthor: '',
    description: '',
    tempo: 10.0,
    autoSave: false,
    autoSaveDuration: 10,
    timeSignature: 4,
    minutesSpent: 0,
    leftClicks: 0,
    rightClicks: 0,
    blocksAdded: 0,
    blocksRemoved: 0,
    songOrigin: '',
    loop: false,
    maxLoopCount: 0,
    loopStart: 0,
    ...data,
  };
}
