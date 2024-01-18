import { PlayerEvent, PlayerEventTarget } from './event';
import { BasePlayer, TPlayerPlayOrStopEvent } from './player';
import { ISong } from './types';

export abstract class BaseFile {
  public abstract readonly displayString: string;

  constructor(public readonly path: string) {}

  public abstract read(): Promise<ISong>;
}

export enum LoopType {
  /** 顺序播放 */
  None,
  /** 列表循环 */
  List,
  /** 单曲循环 */
  Single,
  /** 随机播放 */
  Random,
}

export type TPlaylistEvent<F, P, E> = PlayerEvent<
  BasePlaylist<
    F extends BaseFile ? F : never,
    P extends BasePlayer ? P : never
  >,
  E
>;
export type TPlaylistErrorEvent<F, P> = TPlaylistEvent<F, P, { error: Error }>;

export abstract class BasePlaylist<
  F extends BaseFile = BaseFile,
  P extends BasePlayer = BasePlayer
> extends PlayerEventTarget<
  BasePlaylist<F, P>,
  { error: TPlaylistErrorEvent<F, P> }
> {
  protected loopType: LoopType = LoopType.List;

  protected playing = false;

  protected pausing = false;

  protected playingIndex = -1;

  protected playTask: Promise<void> = Promise.resolve();

  protected playingPlayer?: P;

  constructor(protected files: F[] = []) {
    super();
  }

  public get length() {
    return this.files.length;
  }

  public isPlaying() {
    return this.playing;
  }

  public getPlayingIndex() {
    return this.playingIndex;
  }

  public getFileList(): readonly F[] {
    return this.files;
  }

  public getPlaying() {
    return this.files[this.playingIndex];
  }

  protected async addFileInner(file: F, index = -1) {
    if (index < 0) this.files.push(file);
    else this.files.splice(index, 0, file);

    if (this.playing && this.playingIndex === index) await this.switchNext();
    if (index >= 0 && this.playingIndex > index) this.playingIndex += 1;
  }

  public async addFile(file: F, index = -1) {
    const oldIndex = this.playingIndex;
    await this.addFileInner(file, index);
    if (oldIndex !== this.playingIndex) await this.flush();
  }

  protected async removeFileInner(index: number) {
    this.files.splice(index, 1);

    if (this.playing && this.playingIndex === index) await this.switchNext();
    if (this.playingIndex > index) this.playingIndex -= 1;
  }

  public async removeFile(index: number) {
    const oldIndex = this.playingIndex;
    await this.removeFileInner(index);
    if (oldIndex !== this.playingIndex) await this.flush();
  }

  public async changeIndex(old: number, now: number) {
    const oldIndex = this.playingIndex;
    const oldFile = this.files[old];
    await this.removeFileInner(old);
    await this.addFileInner(oldFile, now);
    if (oldIndex !== this.playingIndex) await this.flush();
  }

  public async clear() {
    this.files = [];
    this.playingIndex = 0;
    await this.stopInner();
  }

  public randomizeList() {
    this.files.sort(() => Math.random() - 0.5);
  }

  protected async switchNext() {
    this.playingIndex += 1;
    if (this.playingIndex < this.length) return;
    switch (this.loopType) {
      case LoopType.List:
        this.playingIndex = 0;
        break;
      case LoopType.Single:
        this.playingIndex = this.length - 1;
        break;
      case LoopType.Random:
        this.randomizeList();
        this.playingIndex = 0;
        break;
      default:
        this.playingIndex = -1;
        break;
    }
  }

  protected async switchPrevious() {
    if (this.playingIndex <= 0) throw new Error('No previous');
    this.playingIndex -= 1;
  }

  public abstract createPlayer(song: ISong): Promise<P>;

  public async stopInner() {
    this.playing = false;
    await this.playTask;
  }

  protected async flush() {
    await this.stopInner();
    if (!this.length || this.playingIndex === -1) return;
    this.playTask.then(async () => {
      try {
        const file = this.files[this.playingIndex];
        const song = await file.read();
        const player = await this.createPlayer(song);
        this.playingPlayer = player;
      } catch (e) {
        this.dispatchEvent(new PlayerEvent('error', { error: e }));
        this.next();
        return;
      }
      this.playing = true;
      await this.playingPlayer.play();
      await new Promise((resolve) => {
        const callback = (ev: TPlayerPlayOrStopEvent) => {
          if (this.pausing || !ev.target?.ended) return;
          this.playingPlayer?.removeEventListener('stop', callback);
          resolve(undefined);
        };
        this.playingPlayer?.addEventListener('stop', callback);
      });
      this.next();
    });
  }

  public switchLoopType(loopType: LoopType) {
    this.loopType = loopType;
    if (loopType === LoopType.Random) this.randomizeList();
  }

  public async play() {
    if (!this.length) throw new Error('Playlist is empty');
  }

  public async pause() {
    if (!this.playingPlayer) throw new Error('Not playing');
    this.pausing = true;
    await this.playingPlayer.pause();
  }

  public async resume() {
    if (!this.playingPlayer) throw new Error('Not playing');
    this.pausing = false;
    await this.playingPlayer.resume();
  }

  public async stop() {
    await this.stopInner();
  }

  public async next() {
    await this.switchNext();
    await this.flush();
  }

  public async previous() {
    await this.switchPrevious();
    await this.flush();
  }
}
