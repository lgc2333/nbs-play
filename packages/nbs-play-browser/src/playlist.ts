import { BasePlaylist, IPlaylistFile, ISong, parse } from 'nbs-play';
import { BrowserPlayer } from './player';

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
  constructor(
    files: BrowserPlaylistFile[] = [],
    public soundPath: string = ''
  ) {
    super(files);
  }

  public override async createPlayer(song: ISong): Promise<BrowserPlayer> {
    return new BrowserPlayer(song, this.soundPath);
  }
}
