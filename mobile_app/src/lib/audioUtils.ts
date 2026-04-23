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
