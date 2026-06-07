import { encode as btoa } from 'base-64';

export const createWavHeader = (pcmDataLength: number, sampleRate: number = 24000, numChannels: number = 1, bitDepth: number = 16) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + pcmDataLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    // bits per sample
    view.setUint16(34, bitDepth, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, pcmDataLength, true);

    return header;
};

const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

// Compute per-frame amplitude envelope (0..1) from base64 PCM16 audio,
// so the AI visualizer bars can track the actual speech loudness.
export const computeAmplitudeEnvelope = (pcmBase64: string, sampleRate = 24000, fps = 30): number[] => {
    const binaryString = global.atob(pcmBase64);
    const len = binaryString.length;
    // Each sample is 2 bytes (Int16 LE)
    const sampleCount = Math.floor(len / 2);
    const windowSize = Math.max(1, Math.floor(sampleRate / fps));
    const envelope: number[] = [];
    let peak = 1;

    for (let i = 0; i < sampleCount; i += windowSize) {
        const end = Math.min(i + windowSize, sampleCount);
        let sumSquares = 0;
        for (let j = i; j < end; j++) {
            const lo = binaryString.charCodeAt(j * 2);
            const hi = binaryString.charCodeAt(j * 2 + 1);
            // Reconstruct signed 16-bit sample
            let s = (hi << 8) | lo;
            if (s >= 0x8000) s -= 0x10000;
            sumSquares += s * s;
        }
        const rms = Math.sqrt(sumSquares / (end - i));
        envelope.push(rms);
        if (rms > peak) peak = rms;
    }

    // Normalize to 0..1 with mild compression so quiet syllables still register
    return envelope.map(v => {
        const n = v / peak;
        return Math.min(1, Math.pow(n, 0.7));
    });
};

// Faster variant of computeAmplitudeEnvelope used in the streaming path.
// Differences:
// - Peak-based (max |sample|) instead of RMS — no sqrt, no running sum of squares.
// - Strided sampling (every 4th sample) — the visualizer only needs a coarse
//   amplitude envelope (30 FPS), and peaks within each 800-sample window are
//   preserved with very high probability even at stride 4.
// Net result: ~4-5x faster than the RMS version with visually identical bar
// motion. This is the version we call off the critical path (via setTimeout
// after playAsync resolves), so the remaining cost never blocks audio start.
export const computePeakEnvelopeFast = (pcmBase64: string, sampleRate = 24000, fps = 30): number[] => {
    const binaryString = global.atob(pcmBase64);
    const len = binaryString.length;
    const sampleCount = Math.floor(len / 2);
    const windowSize = Math.max(1, Math.floor(sampleRate / fps));
    const stride = 4;
    const envelope: number[] = [];
    let globalPeak = 1;

    for (let i = 0; i < sampleCount; i += windowSize) {
        const end = Math.min(i + windowSize, sampleCount);
        let winPeak = 0;
        for (let j = i; j < end; j += stride) {
            const lo = binaryString.charCodeAt(j * 2);
            const hi = binaryString.charCodeAt(j * 2 + 1);
            let s = (hi << 8) | lo;
            if (s >= 0x8000) s -= 0x10000;
            const abs = s < 0 ? -s : s;
            if (abs > winPeak) winPeak = abs;
        }
        envelope.push(winPeak);
        if (winPeak > globalPeak) globalPeak = winPeak;
    }

    // Normalize to 0..1 with mild compression so quiet syllables still register.
    const inv = 1 / globalPeak;
    for (let i = 0; i < envelope.length; i++) {
        const n = envelope[i] * inv;
        envelope[i] = n >= 1 ? 1 : Math.pow(n, 0.7);
    }
    return envelope;
};

// Downsample 24 kHz mono PCM16 to 16 kHz via linear interpolation.
//
// Gemini Live expects input audio at 16 kHz; our mic captures at 24 kHz (the
// OpenAI Realtime format). Ratio is exactly 3:2 so every pair of output samples
// consumes three input samples. Linear interpolation is indistinguishable from
// higher-order filters for voice at this ratio and is ~10x cheaper — we run this
// on every mic chunk (every ~85 ms), so cost matters.
export const resamplePcm16_24kTo16k = (pcm24kBase64: string): string => {
    const binary = global.atob(pcm24kBase64);
    const inLen = binary.length;
    const inSamples = Math.floor(inLen / 2);
    if (inSamples === 0) return pcm24kBase64;

    // Read Int16LE input
    const input = new Int16Array(inSamples);
    for (let i = 0; i < inSamples; i++) {
        const lo = binary.charCodeAt(i * 2);
        const hi = binary.charCodeAt(i * 2 + 1);
        let s = (hi << 8) | lo;
        if (s >= 0x8000) s -= 0x10000;
        input[i] = s;
    }

    // Each output sample at index j maps to input index j * (24/16) = j * 1.5.
    const outSamples = Math.floor(inSamples * 2 / 3);
    const output = new Int16Array(outSamples);
    for (let j = 0; j < outSamples; j++) {
        const srcIdx = j * 1.5;
        const i0 = Math.floor(srcIdx);
        const i1 = Math.min(i0 + 1, inSamples - 1);
        const t = srcIdx - i0;
        output[j] = (input[i0] * (1 - t) + input[i1] * t) | 0;
    }

    // Write back as Int16LE string and re-encode to base64
    let out = '';
    for (let j = 0; j < outSamples; j++) {
        const s = output[j] < 0 ? output[j] + 0x10000 : output[j];
        out += String.fromCharCode(s & 0xff, (s >> 8) & 0xff);
    }
    return global.btoa(out);
};

export const appendWavHeader = (pcmBase64: string, sampleRate = 24000) => {
    // Decode base64 to binary string
    const binaryString = global.atob(pcmBase64);
    const len = binaryString.length;
    const header = createWavHeader(len, sampleRate);

    // Convert header to binary string
    let headerStr = '';
    const headerBytes = new Uint8Array(header);
    for (let i = 0; i < headerBytes.length; i++) {
        headerStr += String.fromCharCode(headerBytes[i]);
    }

    // Combine
    return global.btoa(headerStr + binaryString);
};
