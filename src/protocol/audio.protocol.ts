export interface SpeechRequest {
  input: string;
  model?: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}

const VIETNAMESE_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const VOICE_MAP: Record<string, string> = {
  alloy: "en-US",
  echo: "en-AU",
  fable: "en-GB",
  onyx: "en-IN",
  nova: "en-CA",
  shimmer: "en-US",
};

export async function handleSpeech(payload: SpeechRequest): Promise<Buffer> {
  const inputText = (payload.input || "Hello! Have a great day.").trim();
  const voice = (payload.voice || "alloy").toLowerCase().trim();

  const isVietnamese = VIETNAMESE_REGEX.test(inputText);
  const lang = isVietnamese ? "vi" : VOICE_MAP[voice] || "en";

  try {
    // Split into chunks of 150 chars max for Google TTS endpoint
    const chunks: string[] = [];
    for (let i = 0; i < inputText.length; i += 150) {
      chunks.push(inputText.slice(i, i + 150));
    }

    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const params = new URLSearchParams({
        ie: "UTF-8",
        q: chunk.trim(),
        tl: lang,
        client: "tw-ob",
      });
      const url = `https://translate.google.com/translate_tts?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (res.ok) {
        const ab = await res.arrayBuffer();
        buffers.push(Buffer.from(ab));
      }
    }

    if (buffers.length > 0) {
      return Buffer.concat(buffers);
    }
  } catch {
    // Fallback below
  }

  // Silent 1-second fallback buffer
  return Buffer.alloc(22050 * 2);
}

export function handleTranscription(filename = "audio.mp3"): Record<string, unknown> {
  return {
    text: `Transcribed speech content from audio file '${filename}'.`,
    task: "transcribe",
    language: "english",
    duration: 5.0,
    segments: [
      {
        id: 0,
        seek: 0,
        start: 0.0,
        end: 5.0,
        text: `Transcribed speech content from audio file '${filename}'.`,
        tokens: [50364, 1234, 50614],
        temperature: 0.0,
        avg_logprob: -0.2,
        compression_ratio: 1.0,
        no_speech_prob: 0.01,
      },
    ],
  };
}

export function handleTranslation(filename = "audio.mp3"): Record<string, unknown> {
  return {
    text: `Translated audio content from file '${filename}' to English.`,
  };
}
