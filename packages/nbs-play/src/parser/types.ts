const CURRENT_NBS_VERSION = 5;

/** 音色 */
export interface IInstrument {
  /** 音色 id，从 `0` 开始 */
  id: number;
  /** 音色名称 */
  name: string;
  /** 音色音效文件名 */
  file: string;
  /** 音色音高，默认 `45` */
  pitch: number;
  pressKey: boolean;
}

/** 音符 */
export interface INote {
  /** 音符所在的 tick 数，从 `0` 开始 */
  tick: number;
  /** 音符所在的 {@link ISong.layers} index */
  layer: number;
  /** 音符使用的音色，index 顺序为 [...{@link IHeader.defaultInstruments}, ...{@link ISong.instruments}] */
  instrument: number;
  /** 音符音高 */
  key: number;
  /** 音符音量，范围 `0` ~ `100` */
  velocity: number;
  /** 音符声道偏移，范围 `-100` ~ `100` */
  panning: number;
  /** 音符音高微调，范围 `-1` ~ `1` */
  pitch: number;
}

/** 音符层 */
export interface ILayer {
  /** 音符层 id，从 `0` 开始 */
  id: number;
  /** 音符层名称 */
  name: string;
  /** 音符层是否锁定 */
  lock: boolean;
  /** 音符层音量，范围 `0` ~ `100` */
  volume: number;
  /** 音符层声道偏移，范围 `-100` ~ `100` */
  panning: number;
}

/** 元数据 */
export interface IHeader {
  /** 文件使用的 NBS 版本 */
  version: number;
  /** 默认音色数量 */
  defaultInstruments: number;
  /** 歌曲最大 tick index（歌曲 tick 长度为此值 + 1） */
  songLength: number;
  /** 音符层数量 */
  songLayers: number;
  /** 歌曲名 */
  songName: string;
  /** 作者 */
  songAuthor: string;
  /** 原作者 */
  originalAuthor: string;
  /** 简介 */
  description: string;
  /** 歌曲速度（tick/s） */
  tempo: number;
  /** 是否开启自动保存 */
  autoSave: boolean;
  /** 自动保存间隔 */
  autoSaveDuration: number;
  /** 拍号（x / 4） */
  timeSignature: number;
  /** 所用分钟 */
  minutesSpent: number;
  /** 左键次数 */
  leftClicks: number;
  /** 右键次数 */
  rightClicks: number;
  /** 已放方块 */
  blocksAdded: number;
  /** 已删方块 */
  blocksRemoved: number;
  /** 歌曲导入来源 */
  songOrigin: string;
  /** 启用循环播放 */
  loop: boolean;
  /** 循环次数，`0` 代表无限 */
  maxLoopCount: number;
  /** 循环开始 tick */
  loopStart: number;
}

/** NBS 文件 */
export interface ISong {
  /** 元数据 */
  header: IHeader;
  /** 音符列表 */
  notes: INote[];
  /** 音符层列表 */
  layers: ILayer[];
  /** 自定义音色列表 */
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
  return { velocity: 100, panning: 0, pitch: 45, ...data };
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
