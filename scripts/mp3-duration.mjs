// Frame durations, not text-length estimates. Azure's output is MPEG Layer III.
export function mp3Duration(bytes) {
  let offset = 0, seconds = 0, frames = 0;
  if (bytes.subarray(0, 3).toString() === "ID3") {
    if (bytes.length < 10) throw new Error("Truncated ID3 header");
    const size = ((bytes[6] & 127) << 21) | ((bytes[7] & 127) << 14) | ((bytes[8] & 127) << 7) | (bytes[9] & 127);
    offset = 10 + size + (bytes[5] & 16 ? 10 : 0);
  }
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 255 || (bytes[offset + 1] & 224) !== 224) { offset++; continue; }
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = bytes[offset + 2] >> 4;
    const sampleIndex = (bytes[offset + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) { offset++; continue; }
    const bitrate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrateIndex] * 1000;
    const sampleRate = [44100,48000,32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const size = Math.floor((version === 3 ? 144 : 72) * bitrate / sampleRate) + ((bytes[offset + 2] >> 1) & 1);
    if (offset + size > bytes.length) throw new Error("Truncated MP3 frame");
    seconds += (version === 3 ? 1152 : 576) / sampleRate;
    frames++; offset += size;
  }
  if (!frames) throw new Error("MP3 contains no audio frames");
  return Math.round(seconds * 1000) / 1000;
}
