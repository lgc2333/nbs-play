import { PlayerEvent, PlayerEventTarget } from './event';
import { BasePlayer } from './player';
import { ISong } from './types';

export interface IPlaylistFile {
  readonly displayString: string;
  read(): Promise<ISong>;
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
    F extends IPlaylistFile ? F : never,
    P extends BasePlayer ? P : never
  >,
  E
>;
export type TPlaylistEventEmpty<F, P> = TPlaylistEvent<F, P, {}>;
export type TPlaylistErrorEvent<F, P> = TPlaylistEvent<F, P, { error: Error }>;
export type TPlaylistTickEvent<F, P> = TPlaylistEvent<
  F,
  P,
  { passedTicks: number; player: P }
>;
export type TPlaylistSwitchEvent<F, P> = TPlaylistEvent<
  F,
  P,
  { file?: IPlaylistFile }
>;
export type TPlaylistChangeEvent<F, P> = TPlaylistEvent<
  F,
  P,
  { list: readonly IPlaylistFile[] }
>;
export type TPlaylistLoopChangeEvent<F, P> = TPlaylistEvent<
  F,
  P,
  { loopType: LoopType }
>;

export type TPlaylistEventMap<F, P> = {
  error: TPlaylistErrorEvent<F, P>;
  tick: TPlaylistTickEvent<F, P>;
  switch: TPlaylistSwitchEvent<F, P>;
  change: TPlaylistChangeEvent<F, P>;
  play: TPlaylistEventEmpty<F, P>;
  stop: TPlaylistEventEmpty<F, P>;
  pause: TPlaylistEventEmpty<F, P>;
  resume: TPlaylistEventEmpty<F, P>;
  loopChange: TPlaylistLoopChangeEvent<F, P>;
};

export abstract class BasePlaylist<
  F extends IPlaylistFile = IPlaylistFile,
  P extends BasePlayer = BasePlayer
> extends PlayerEventTarget<BasePlaylist<F, P>, TPlaylistEventMap<F, P>> {
  protected loopType: LoopType = LoopType.List;

  protected playing = false;

  protected pausing = false;

  protected stopFunc?: () => Promise<void>;

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

  public getLoopType() {
    return this.loopType;
  }

  public getFileList(): readonly F[] {
    return this.files;
  }

  public getPlaying() {
    return this.files[this.playingIndex];
  }

  public getPlayingPlayer() {
    return this.playingPlayer;
  }

  protected async addFileInner(file: F, index = -1) {
    if (index < 0) this.files.push(file);
    else this.files.splice(index, 0, file);

    if (this.playingIndex === index) await this.switchNext();
    if (index >= 0 && this.playingIndex > index) this.playingIndex += 1;
  }

  public async addFile(file: F, index = -1) {
    const oldIndex = this.playingIndex;
    await this.addFileInner(file, index);
    if (this.playing && oldIndex !== this.playingIndex) await this.flush();
    this.dispatchEvent(new PlayerEvent('change', { list: this.files }));
  }

  protected async removeFileInner(index: number) {
    this.files.splice(index, 1);

    if (this.playingIndex === index) await this.switchNext();
    if (this.playingIndex > index) this.playingIndex -= 1;
  }

  public async removeFile(index: number) {
    const oldIndex = this.playingIndex;
    await this.removeFileInner(index);
    if (this.playing && oldIndex !== this.playingIndex) await this.flush();
    this.dispatchEvent(new PlayerEvent('change', { list: this.files }));
  }

  public async changeIndex(old: number, now: number) {
    const oldIndex = this.playingIndex;
    const oldFile = this.files[old];
    await this.removeFileInner(old);
    await this.addFileInner(oldFile, now);
    if (this.playing && oldIndex !== this.playingIndex) await this.flush();
    this.dispatchEvent(new PlayerEvent('change', { list: this.files }));
  }

  public async clear() {
    this.files = [];
    this.playingIndex = 0;
    await this.stopInner();
    this.dispatchEvent(new PlayerEvent('change', { list: this.files }));
  }

  public randomizeList() {
    const playingFile = this.getPlaying();
    this.files.sort(() => Math.random() - 0.5);
    if (this.playingIndex !== -1)
      this.playingIndex = this.files.indexOf(playingFile);
    this.dispatchEvent(new PlayerEvent('change', { list: this.files }));
  }

  protected async switchNext() {
    if (this.playingIndex >= this.length - 1) {
      switch (this.loopType) {
        case LoopType.Single:
          break;
        case LoopType.List:
          this.playingIndex = 0;
          break;
        case LoopType.Random:
          this.randomizeList();
          this.playingIndex = 0;
          break;
        default: // None
          throw new Error('No next');
      }
    } else {
      this.playingIndex += 1;
    }
    this.dispatchEvent(new PlayerEvent('switch', { file: this.getPlaying() }));
  }

  protected async switchPrevious() {
    if (this.playingIndex > 0) {
      this.playingIndex -= 1;
    } else if (this.loopType === LoopType.Random) {
      this.randomizeList();
      this.playingIndex = 0;
    } else if (this.loopType === LoopType.List) {
      this.playingIndex = this.length - 1;
    } else {
      throw new Error('No previous');
    }
    this.dispatchEvent(new PlayerEvent('switch', { file: this.getPlaying() }));
  }

  public abstract createPlayer(song: ISong): Promise<P>;

  public async stopInner() {
    await this.stopFunc?.();
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
        this.playTask.then(this.next.bind(this));
        return;
      }

      this.playing = true;
      await this.playingPlayer.play();
      await new Promise((resolve) => {
        const clearState = async () => {
          this.stopFunc = undefined;
          if (this.playingPlayer?.playing) await this.playingPlayer?.stop();
          this.playingPlayer = undefined;
        };

        this.playingPlayer?.addEventListener('tick', (e) => {
          if (e.target !== this.playingPlayer) return;
          this.dispatchEvent(
            new PlayerEvent('tick', { ...e.params, player: e.target })
          );
        });
        this.playingPlayer?.addEventListener('stop', async () => {
          if (this.pausing) return;
          await clearState();
          resolve(undefined);
        });

        this.stopFunc = async () => {
          this.playing = false;
          await clearState();
          resolve(undefined);
        };
      });

      if (this.playing) {
        if (this.loopType === LoopType.Single) {
          this.playTask.then(this.flush.bind(this));
        } else {
          this.playTask.then(async () => {
            try {
              await this.next();
            } catch (e) {
              // no next
              this.playing = false;
              this.playingIndex = -1;
              this.dispatchEvent(
                new PlayerEvent('switch', { file: undefined })
              );
              this.dispatchEvent(new PlayerEvent('stop'));
            }
          });
        }
      }
    });
  }

  public switchLoopType(loopType: LoopType) {
    if (this.loopType === loopType) return;
    this.loopType = loopType;
    this.dispatchEvent(new PlayerEvent('loopChange', { loopType }));
    if (loopType === LoopType.Random) this.randomizeList();
  }

  public async play() {
    if (!this.length) throw new Error('Playlist is empty');
    if (this.playingIndex === -1) {
      this.playingIndex = 0;
      this.dispatchEvent(
        new PlayerEvent('switch', { file: this.getPlaying() })
      );
    }
    this.pausing = false;
    await this.flush();
    this.dispatchEvent(new PlayerEvent('play'));
  }

  public async pause() {
    if (!this.playingPlayer) throw new Error('Not playing');
    this.pausing = true;
    await this.playingPlayer.pause();
    this.dispatchEvent(new PlayerEvent('pause'));
  }

  public async resume() {
    if (!this.playingPlayer) throw new Error('Not playing');
    this.pausing = false;
    await this.playingPlayer.resume();
    this.dispatchEvent(new PlayerEvent('resume'));
  }

  public async stop() {
    this.pausing = false;
    await this.stopInner();
    this.dispatchEvent(new PlayerEvent('stop'));
  }

  public async next() {
    await this.switchNext();
    await this.flush();
  }

  public async previous() {
    await this.switchPrevious();
    await this.flush();
  }

  public async switchTo(index: number) {
    if (index < 0 || index >= this.length)
      throw new Error(`Index out of range: ${index}`);
    this.playingIndex = index;
    this.dispatchEvent(new PlayerEvent('switch', { file: this.getPlaying() }));
    await this.flush();
  }
}
