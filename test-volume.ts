import { createAudioResource, StreamType } from '@discordjs/voice';
import { PassThrough } from 'stream';

try {
  const stream = new PassThrough();
  const resource = createAudioResource(stream, { inputType: StreamType.Opus, inlineVolume: true });
  resource.volume?.setVolume(0.5);
  console.log('Success! Volume:', resource.volume?.volume);
  console.log('Edges:', resource.edges.map(e => `${e.type} -> ${e.to.type}`));
} catch (e) {
  console.error('Error:', e);
}
