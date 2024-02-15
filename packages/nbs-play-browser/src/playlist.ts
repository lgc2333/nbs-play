import { BasePlaylist, IPlaylistFile, ISong, parse } from 'nbs-play';
import { BrowserPlayer, BrowserPlayerOptions } from './player';

export class BrowserPlaylistFile implements IPlaylistFile {
  constructor(
    public readonly url: string,
    public readonly displayString: string = ''
  ) {
    if (!displayString) this.displayString = url.split('/').pop()!;
  }

  public async read(): Promise<ISong> {
    return parse(await (await fetch(this.url)).arrayBuffer());
  }
}

export class BrowserPlaylist extends BasePlaylist<
  BrowserPlaylistFile,
  BrowserPlayer
> {
  public soundPath: string;

  constructor(fileList: BrowserPlaylistFile[], options?: BrowserPlayerOptions) {
    super(fileList, options);
    const { soundPath } = options || {};
    if (!soundPath) throw new Error('soundPath is required');
    this.soundPath = soundPath;
  }

  public override async createPlayer(song: ISong): Promise<BrowserPlayer> {
    return new BrowserPlayer(song, { soundPath: this.soundPath });
  }
}
