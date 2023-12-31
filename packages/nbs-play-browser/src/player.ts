import { BasePlayer, IPlayNote, ISong } from 'nbs-play';

/** 浏览器 NBS 播放器实现 */
export class BrowserPlayer extends BasePlayer {
  /** 音色音效文件基路径 */
  public soundPath: string;

  /** 已加载音色音效数据，index 与 {@link BasePlayer.instruments} 对应 */
  public loadedInstruments: (AudioBuffer | undefined)[] = [];

  /** 音量，范围应为 `0` ~ `1` */
  public volumeMultiplier = 0.8;

  public audioContext: AudioContext;

  constructor(song: ISong, soundPath: string) {
    super(song);
    this.soundPath = soundPath.endsWith('/') ? soundPath : `${soundPath}/`;
    this.audioContext = new AudioContext();
  }

  /** 从给定 URL 获取 AudioBuffer */
  async fetchAudioBuffer(path: string): Promise<AudioBuffer | undefined> {
    try {
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();
      return await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error(`Failed to fetch audio ${path}`);
      console.error(e);
    }
    return undefined;
  }

  /** 加载音色音效数据 */
  async loadInstrumentSound(): Promise<void> {
    await Promise.all(
      this.instruments.map(async (instrument, i) => {
        const audioBuffer = await this.fetchAudioBuffer(
          `${this.soundPath}${instrument.file}`
        );
        this.loadedInstruments[i] = audioBuffer;
      })
    );
  }

  protected override async prepare(): Promise<void> {
    await this.loadInstrumentSound();
  }

  override async playNote(note: IPlayNote): Promise<void> {
    const audio = this.loadedInstruments[note.instrument];
    if (!audio) return;

    let sourceNode: AudioNode;
    const bufferSource = this.audioContext.createBufferSource();
    bufferSource.buffer = audio;
    bufferSource.start(0);
    bufferSource.playbackRate.value = note.pitch;
    sourceNode = bufferSource;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = (note.velocity / 100) * this.volumeMultiplier; // Decrease volume to avoid peaking
    sourceNode = bufferSource.connect(gainNode);

    if (note.panning) {
      const panningNode = this.audioContext.createStereoPanner();
      panningNode.pan.value = note.panning / 100;
      sourceNode = gainNode.connect(panningNode);
    }

    sourceNode.connect(this.audioContext.destination);
  }
}
