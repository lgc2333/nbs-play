import { PlayerEvent, PlayerEventTarget } from './event';
import { BasePlayer } from './player';
import { ISong } from './types';
import { sleep } from './utils';

export abstract class BasePlaylistFile {
  constructor(
    public readonly url: string,
    public readonly displayString: string = ''
  ) {
    if (!displayString) this.displayString = url.split('/').pop()!;
  }

  public abstract read(): Promise<ISong>;

  public equals(other: BasePlaylistFile) {
    return this.url === other.url;
  }
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
    F extends BasePlaylistFile ? F : never,
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
export type TPlaylistSwitchEvent<F, P> = TPlaylistEvent<F, P, { file?: F }>;
export type TPlaylistChangeEvent<F, P> = TPlaylistEvent<
  F,
  P,
  { list: readonly F[] }
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
  F extends BasePlaylistFile = BasePlaylistFile,
  P extends BasePlayer = BasePlayer
> extends PlayerEventTarget<BasePlaylist<F, P>, TPlaylistEventMap<F, P>> {
  public delayTime: number = 1000;

  protected _loopType: LoopType = LoopType.List;

  /** 是否正在播放，内部用 */
  protected _isPlaying = false;

  /** 是否正在暂停，内部用 */
  protected _isPausing = false;

  protected _stopFunc?: () => Promise<void>;

  protected _playingIndex = 0;

  protected _playTask: Promise<void> = Promise.resolve();

  protected _playingPlayer?: P;

  protected _shuffledList?: F[];

  constructor(protected _fileList: F[] = [], options?: any) {
    super();
  }

  public get currentFileList(): F[] {
    return this._loopType === LoopType.Shuffle
      ? this._shuffledList ?? this.newShuffledList()
      : this._fileList;
  }

  public get fileList(): readonly F[] {
    return this._fileList;
  }

  public get length() {
    return this._fileList.length;
  }

  public get isActive() {
    return this._isPlaying || this._isPausing;
  }

  public get isPlaying() {
    return this._isPlaying;
  }

  public get isPausing() {
    return this._isPausing;
  }

  public get playingIndex() {
    return this._playingIndex;
  }

  public get loopType() {
    return this._loopType;
  }

  public get playingFile() {
    return this.currentFileList[this._playingIndex];
  }

  public get playingPlayer() {
    return this._playingPlayer;
  }

  protected async extendFilesInner(targetList: F[], files: F[], index = -1) {
    if (index === -1) index = this.length;
    for (const f of files.reverse()) {
      const i = targetList.findIndex((v) => v.equals(f));
      if (i === -1) {
        targetList.splice(index, 0, f);
      } else {
        if (i === index) continue;
        if (i < index) index -= 1;
        this.changeIndexInner(i, index);
      }
    }
  }

  public async extendFiles(files: F[], index = -1) {
    const { playingFile } = this;

    await this.extendFilesInner(this.currentFileList, files, index);
    if (this._loopType === LoopType.Shuffle) {
      await this.extendFilesInner(this._fileList, files, -1);
    }

    const fi = this.currentFileList.indexOf(playingFile);
    if (fi !== -1) this._playingIndex = fi;
    this.dispatchEvent(
      new PlayerEvent('change', { list: this.currentFileList })
    );
  }

  public addFile(file: F, index = -1) {
    return this.extendFiles([file], index);
  }

  protected async removeFilesInner(targetList: F[], indexes: number[]) {
    for (const i of indexes) targetList.splice(i, 1);
  }

  public async removeFiles(indexes: number[]) {
    const { playingFile } = this;

    const items = indexes.map((i) => this.currentFileList[i]);
    await this.removeFilesInner(this.currentFileList, indexes);
    if (this._loopType === LoopType.Shuffle) {
      await this.removeFilesInner(
        this._fileList,
        items.map((x) => this._fileList.indexOf(x))
      );
    }

    const newIndex = this.currentFileList.indexOf(playingFile);
    if (newIndex === -1) {
      this._playingIndex = 0;
      if (!this.length) await this.stop();
      else if (this.isActive) await this.flush();
    } else {
      this._playingIndex = newIndex;
    }
    this.dispatchEvent(
      new PlayerEvent('change', { list: this.currentFileList })
    );
  }

  public removeFile(index: number) {
    return this.removeFiles([index]);
  }

  protected async changeIndexInner(old: number, now: number) {
    const [x] = this.currentFileList.splice(old, 1);
    this.currentFileList.splice(now, 0, x);
  }

  public async changeIndex(old: number, now: number) {
    const { playingFile } = this;
    await this.changeIndexInner(old, now);
    this._playingIndex = this.currentFileList.indexOf(playingFile);
    this.dispatchEvent(
      new PlayerEvent('change', { list: this.currentFileList })
    );
  }

  public async reset(newList: F[] = []) {
    this._shuffledList = undefined;
    this._playingIndex = 0;
    if (this._isPlaying) this.dispatchEvent(new PlayerEvent('stop'));
    await this.stopInner();
    this._fileList = newList;
    if (this._loopType === LoopType.Shuffle) this.newShuffledList();
    this.dispatchEvent(
      new PlayerEvent('change', { list: this.currentFileList })
    );
  }

  public newShuffledList() {
    const li = [...this._fileList];
    this._shuffledList = li.sort(() => Math.random() - 0.5);
    return li;
  }

  protected async switchNext(manually = false) {
    if (this._playingIndex >= this.length - 1) {
      switch (this._loopType) {
        case LoopType.Single:
          if (manually) this._playingIndex = 0;
          break;
        case LoopType.List:
          this._playingIndex = 0;
          break;
        case LoopType.Shuffle:
          this.newShuffledList();
          this._playingIndex = 0;
          break;
        default: // None
          throw new Error('No next');
      }
    } else if (this._loopType !== LoopType.Single || manually) {
      this._playingIndex += 1;
    } else {
      return;
    }
    this.dispatchEvent(new PlayerEvent('switch', { file: this.playingFile }));
  }

  protected async switchPrevious(manually = false) {
    if (this._playingIndex > 0) {
      this._playingIndex -= 1;
    } else if (
      manually ||
      this._loopType === LoopType.Shuffle ||
      this._loopType === LoopType.List
    ) {
      this._playingIndex = this.length - 1;
    } else {
      throw new Error('No previous');
    }
    this.dispatchEvent(new PlayerEvent('switch', { file: this.playingFile }));
  }

  public abstract createPlayer(song: ISong): Promise<P>;

  public async stopInner() {
    await this._stopFunc?.();
    this._isPlaying = false; // 保险
    await this._playTask;
  }

  protected async flush() {
    await this.stopInner();
    if (!this.length) return;

    let currentPlayer: P;

    const loadSong = async () => {
      try {
        const song = await this.playingFile.read();
        currentPlayer = await this.createPlayer(song);
      } catch (e) {
        this.dispatchEvent(
          new PlayerEvent('error', {
            error: new Error(
              `Error when reading file ${this.playingFile.url}, ` +
                `skip and remove it from playlist (${e})`
            ),
          })
        );
        this._playTask
          .then(this.removeFile.bind(this, this._playingIndex))
          .then(this.next.bind(this));
        return;
      }
      this._playingPlayer = currentPlayer;
      this._isPlaying = true;
      await this._playingPlayer.play();
      this._playTask.then(checkStop).then(switchNext);
    };

    const checkStop = () =>
      new Promise((resolve) => {
        const clearState = async () => {
          if (currentPlayer?.playing) await currentPlayer?.stop();
          if (currentPlayer === this._playingPlayer) {
            this._stopFunc = undefined;
            this._playingPlayer = undefined;
          }
        };

        this._playingPlayer?.addEventListener('tick', (e) => {
          if (e.target !== this._playingPlayer) return;
          this.dispatchEvent(
            new PlayerEvent('tick', { ...e.params, player: e.target })
          );
        });
        this._playingPlayer?.addEventListener('stop', async () => {
          if (this._isPausing) return;
          await sleep(this.delayTime);
          await clearState();
          resolve(undefined);
        });

        this._stopFunc = async () => {
          this._isPlaying = false;
          await clearState();
          resolve(undefined);
        };
      });

    const switchNext = async () => {
      if (!this._isPlaying) return;
      this._playTask.then(async () => {
        try {
          await this.switchNext();
          await this.flush();
        } catch (e) {
          // no next
          this._isPlaying = false;
          this._playingIndex = -1;
          this.dispatchEvent(new PlayerEvent('switch', { file: undefined }));
          this.dispatchEvent(new PlayerEvent('stop'));
        }
      });
    };

    await this._playTask.then(loadSong);
  }

  public switchLoopType(loopType: LoopType) {
    if (this._loopType === loopType) return;
    const oldLoopType = this._loopType;
    this._loopType = loopType;
    this.dispatchEvent(new PlayerEvent('loopChange', { loopType }));
    if (loopType === LoopType.Shuffle) {
      this.newShuffledList();
      if (this._playingIndex !== -1)
        this._playingIndex = this.currentFileList.indexOf(
          this._fileList[this._playingIndex]
        );
      this.dispatchEvent(
        new PlayerEvent('change', { list: this.currentFileList })
      );
    } else if (oldLoopType === LoopType.Shuffle) {
      if (this._playingIndex !== -1 && this._shuffledList)
        this._playingIndex = this.currentFileList.indexOf(
          this._shuffledList[this._playingIndex]
        );
      this.dispatchEvent(
        new PlayerEvent('change', { list: this.currentFileList })
      );
    }
  }

  public async play() {
    if (!this.length) throw new Error('Playlist is empty');
    if (this._playingIndex === -1) {
      this._playingIndex = 0;
      this.dispatchEvent(new PlayerEvent('switch', { file: this.playingFile }));
    }
    this._isPausing = false;
    await this.flush();
    this.dispatchEvent(new PlayerEvent('play'));
  }

  public async pause() {
    if (!this._playingPlayer) throw new Error('Not playing');
    this._isPausing = true;
    await this._playingPlayer.pause();
    this.dispatchEvent(new PlayerEvent('pause'));
  }

  public async resume() {
    if (!this._playingPlayer) throw new Error('Not playing');
    this._isPausing = false;
    await this._playingPlayer.resume();
    this.dispatchEvent(new PlayerEvent('resume'));
  }

  public async stop() {
    this._isPausing = false;
    await this.stopInner();
    this.dispatchEvent(new PlayerEvent('stop'));
  }

  public async next() {
    await this.switchNext(true);
    await this.flush();
  }

  public async previous() {
    await this.switchPrevious(true);
    await this.flush();
  }

  public async switchTo(index: number) {
    if (index < 0 || index >= this.length)
      throw new Error(`Index out of range: ${index}`);
    this._playingIndex = index;
    this.dispatchEvent(new PlayerEvent('switch', { file: this.playingFile }));
    await this.flush();
  }
}
