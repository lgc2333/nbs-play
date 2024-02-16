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
  Shuffle,
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

  /** 是否正在播放，内部用 */
  protected isPlaying = false;

  /** 是否正在暂停，内部用 */
  protected isPausing = false;

  protected stopFunc?: () => Promise<void>;

  protected playingIndex = -1;

  protected playTask: Promise<void> = Promise.resolve();

  protected playingPlayer?: P;

  protected shuffledList?: F[];

  constructor(protected fileList: F[] = [], options?: any) {
    super();
  }

  protected get currentPlaylist(): F[] {
    return this.loopType === LoopType.Shuffle
      ? this.shuffledList ?? this.newShuffledList()
      : this.fileList;
  }

  public get length() {
    return this.currentPlaylist.length;
  }

  public get playing() {
    return this.isPlaying;
  }

  public getPlayingIndex() {
    return this.playingIndex;
  }

  public getLoopType() {
    return this.loopType;
  }

  public getPlaying() {
    return this.currentPlaylist[this.playingIndex];
  }

  public getPlayingPlayer() {
    return this.playingPlayer;
  }

  public getPlaylist() {
    return this.currentPlaylist;
  }

  public async addFile(file: F, index = -1) {
    const playingFile = this.getPlaying();

    if (index < 0) this.fileList.push(file);
    else this.fileList.splice(index, 0, file);
    this.newShuffledList();

    this.playingIndex = this.currentPlaylist.indexOf(playingFile);
    this.dispatchEvent(
      new PlayerEvent('change', { list: this.currentPlaylist })
    );
  }

  public async removeFile(index: number) {
    const playingFile = this.getPlaying();

    this.fileList.splice(index, 1);
    this.newShuffledList();

    const newIndex = this.currentPlaylist.indexOf(playingFile);
    if (newIndex !== -1) this.playingIndex = newIndex;
    else this.flush();
    this.dispatchEvent(
      new PlayerEvent('change', { list: this.currentPlaylist })
    );
  }

  public async changeIndex(old: number, now: number) {
    const playingFile = this.getPlaying();

    this.currentPlaylist.splice(old, 1);
    this.currentPlaylist.splice(now, 0, this.currentPlaylist[old]);

    this.playingIndex = this.currentPlaylist.indexOf(playingFile);
    this.dispatchEvent(
      new PlayerEvent('change', { list: this.currentPlaylist })
    );
  }

  public async clear() {
    this.fileList = [];
    this.shuffledList = undefined;
    this.playingIndex = 0;
    if (this.isPlaying) this.dispatchEvent(new PlayerEvent('stop'));
    await this.stopInner();
    this.dispatchEvent(new PlayerEvent('change', { list: [] }));
  }

  public newShuffledList() {
    this.shuffledList = [...this.fileList];
    this.shuffledList.sort(() => Math.random() - 0.5);
    return this.shuffledList;
  }

  protected async switchNext() {
    if (this.playingIndex >= this.length - 1) {
      switch (this.loopType) {
        case LoopType.Single:
          break;
        case LoopType.List:
          this.playingIndex = 0;
          break;
        case LoopType.Shuffle:
          this.newShuffledList();
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
    } else if (
      this.loopType === LoopType.Shuffle ||
      this.loopType === LoopType.List
    ) {
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
        const file = this.getPlaying();
        const song = await file.read();
        const player = await this.createPlayer(song);
        this.playingPlayer = player;
      } catch (e) {
        this.dispatchEvent(new PlayerEvent('error', { error: e }));
        this.playTask.then(this.next.bind(this));
        return;
      }

      this.isPlaying = true;
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
          if (this.isPausing) return;
          await clearState();
          resolve(undefined);
        });

        this.stopFunc = async () => {
          this.isPlaying = false;
          await clearState();
          resolve(undefined);
        };
      });

      if (!this.isPlaying) return;
      if (this.loopType === LoopType.Single) {
        this.playTask.then(this.flush.bind(this));
        return;
      }
      this.playTask.then(async () => {
        try {
          await this.next();
        } catch (e) {
          // no next
          this.isPlaying = false;
          this.playingIndex = -1;
          this.dispatchEvent(new PlayerEvent('switch', { file: undefined }));
          this.dispatchEvent(new PlayerEvent('stop'));
        }
      });
    });
  }

  public switchLoopType(loopType: LoopType) {
    if (this.loopType === loopType) return;
    const oldLoopType = this.loopType;
    this.loopType = loopType;
    this.dispatchEvent(new PlayerEvent('loopChange', { loopType }));
    if (loopType === LoopType.Shuffle) {
      this.newShuffledList();
      if (this.playingIndex !== -1)
        this.playingIndex = this.currentPlaylist.indexOf(
          this.fileList[this.playingIndex]
        );
      this.dispatchEvent(
        new PlayerEvent('change', { list: this.currentPlaylist })
      );
    } else if (oldLoopType === LoopType.Shuffle) {
      if (this.playingIndex !== -1 && this.shuffledList)
        this.playingIndex = this.currentPlaylist.indexOf(
          this.shuffledList[this.playingIndex]
        );
      this.dispatchEvent(
        new PlayerEvent('change', { list: this.currentPlaylist })
      );
    }
  }

  public async play() {
    if (!this.length) throw new Error('Playlist is empty');
    if (this.playingIndex === -1) {
      this.playingIndex = 0;
      this.dispatchEvent(
        new PlayerEvent('switch', { file: this.getPlaying() })
      );
    }
    this.isPausing = false;
    await this.flush();
    this.dispatchEvent(new PlayerEvent('play'));
  }

  public async pause() {
    if (!this.playingPlayer) throw new Error('Not playing');
    this.isPausing = true;
    await this.playingPlayer.pause();
    this.dispatchEvent(new PlayerEvent('pause'));
  }

  public async resume() {
    if (!this.playingPlayer) throw new Error('Not playing');
    this.isPausing = false;
    await this.playingPlayer.resume();
    this.dispatchEvent(new PlayerEvent('resume'));
  }

  public async stop() {
    this.isPausing = false;
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
