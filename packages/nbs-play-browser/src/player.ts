import { BasePlayer, IPlayNote, ISong } from 'nbs-play';

const audioContext = new AudioContext();
const audioDestination = audioContext.createGain();
audioDestination.connect(audioContext.destination);

async function fetchAudioBuffer(
  path: string
): Promise<AudioBuffer | undefined> {
  try {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.error(`Failed to load audio ${path}`, e);
  }
  return undefined;
}

export class BrowserPlayer extends BasePlayer {
  loadedInstruments: (AudioBuffer | undefined)[] = [];

  constructor(song: ISong, public soundPath: string) {
    super(song);
  }

  protected async loadAudio(): Promise<void> {
    const promises = this.instruments.map(async (instrument, i) => {
      const audioBuffer = await fetchAudioBuffer(
        `${this.soundPath}/${instrument.file}`
      );
      this.loadedInstruments[i] = audioBuffer;
    });
    await Promise.all(promises);
  }

  protected async prepare(): Promise<void> {
    await this.loadAudio();
  }

  protected async playNote(note: IPlayNote): Promise<void> {
    const audio = this.loadedInstruments[note.instrument];
    if (!audio) return;

    const source = audioContext.createBufferSource();
    source.buffer = audio;
    source.start(0);
    source.playbackRate.value = note.pitch;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = note.velocity / 2 / 100; // Decrease volume to avoid peaking
    source.connect(gainNode);

    if (note.panning) {
      const panningNode = audioContext.createStereoPanner();
      panningNode.pan.value = note.panning / 100;
      gainNode.connect(panningNode);
      panningNode.connect(audioDestination);
    } else {
      gainNode.connect(audioDestination);
    }
  }
}

export default {};
