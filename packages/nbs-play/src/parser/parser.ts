import { IHeader, IInstrument, ILayer, INote, ISong } from './types.js';

export async function arrFromAsync<T>(
  iterable: AsyncIterable<T>
): Promise<T[]> {
  const arr: T[] = [];
  for await (const item of iterable) arr.push(item);
  return arr;
}

/** NBS 文件解析器 */
export class Parser {
  protected view: DataView;

  protected offset = 0x0;

  constructor(protected buf: ArrayBuffer) {
    this.view = new DataView(buf);
  }

  public async parse(): Promise<ISong> {
    const header = await this.parseHeader();
    const { version, songLayers } = header;
    const [notes, layers, instruments] = await Promise.all([
      arrFromAsync(this.parseNotes(version)),
      arrFromAsync(this.parseLayers(songLayers, version)),
      arrFromAsync(this.parseInstruments()),
    ]);
    this.offset = 0x0;
    return { header, notes, layers, instruments };
  }

  protected readUChar(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 0x1;
    return value;
  }

  protected readUShort(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 0x2;
    return value;
  }

  protected readShort(): number {
    const value = this.view.getInt16(this.offset, true);
    this.offset += 0x2;
    return value;
  }

  protected readUInt(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 0x4;
    return value;
  }

  protected readString(): string {
    const length = this.readUInt();
    const value = new TextDecoder('cp1252').decode(
      this.buf.slice(this.offset, this.offset + length)
    );
    this.offset += length;
    return value;
  }

  protected async parseHeader(): Promise<IHeader> {
    const songLength = this.readUShort();
    const version = songLength === 0 ? this.readUChar() : 0;
    return {
      version,
      defaultInstruments: version > 0 ? this.readUChar() : 10,
      songLength: version >= 3 ? this.readUShort() : songLength,
      songLayers: this.readUShort(),
      songName: this.readString(),
      songAuthor: this.readString(),
      originalAuthor: this.readString(),
      description: this.readString(),
      tempo: this.readUShort() / 100,
      autoSave: this.readUChar() === 1,
      autoSaveDuration: this.readUChar(),
      timeSignature: this.readUChar(),
      minutesSpent: this.readUInt(),
      leftClicks: this.readUInt(),
      rightClicks: this.readUInt(),
      blocksAdded: this.readUInt(),
      blocksRemoved: this.readUInt(),
      songOrigin: this.readString(),
      loop: version >= 4 ? this.readUChar() === 1 : false,
      maxLoopCount: version >= 4 ? this.readUChar() : 0,
      loopStart: version >= 4 ? this.readUShort() : 0,
    };
  }

  protected async *jump(): AsyncGenerator<number> {
    let value = -1;
    for (;;) {
      const jump = this.readUShort();
      if (jump === 0) break;
      value += jump;
      yield value;
    }
  }

  protected async *parseNotes(version: number): AsyncGenerator<INote> {
    for await (const currentTick of this.jump()) {
      for await (const currentLayer of this.jump()) {
        yield {
          tick: currentTick,
          layer: currentLayer,
          instrument: this.readUChar(),
          key: this.readUChar(),
          velocity: version >= 4 ? this.readUChar() : 100,
          panning: version >= 4 ? this.readUChar() - 100 : 0,
          pitch: version >= 4 ? this.readShort() : 0,
        };
      }
    }
  }

  protected async *parseLayers(
    layerCount: number,
    version: number
  ): AsyncGenerator<ILayer> {
    for (let id = 0; id < layerCount; id += 1) {
      yield {
        id,
        name: this.readString(),
        lock: version >= 4 ? this.readUChar() === 1 : false,
        volume: this.readUChar(),
        panning: version >= 2 ? this.readUChar() - 100 : 0,
      };
    }
  }

  protected async *parseInstruments(): AsyncGenerator<IInstrument> {
    const len = this.readUChar();
    for (let id = 0; id < len; id += 1) {
      yield {
        id,
        name: this.readString(),
        file: this.readString(),
        pitch: this.readUChar(),
        pressKey: this.readUChar() === 1,
      };
    }
  }
}

export async function parse(buf: ArrayBuffer): Promise<ISong> {
  return new Parser(buf).parse();
}
