import * as yt from 'youtube-ext';

async function test() {
  try {
    const info = await yt.videoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const formats = await yt.getFormats(info.stream);
    const audioFormats = formats.filter(f => f.mimeType.includes('audio'));
    const bestFormat = audioFormats.sort((a, b) => b.bitrate - a.bitrate)[0];
    
    console.log('Best format:', bestFormat.mimeType);
    const stream = await yt.getReadableStream(bestFormat);
    console.log('Stream created:', !!stream);
    
    let bytes = 0;
    stream.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 100000) {
        console.log('Successfully read >100KB');
        process.exit(0);
      }
    });
  } catch (e) {
    console.error('Failed:', e);
  }
}
test();
