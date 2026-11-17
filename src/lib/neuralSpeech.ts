interface NeuralSpeechAudio {
  toBlob(): Blob | Promise<Blob>;
}

interface NeuralSpeechPipeline {
  (
    text: string,
    options: {
      speaker_embeddings: string;
      num_inference_steps: number;
      speed: number;
    },
  ): Promise<NeuralSpeechAudio>;
}

const NEURAL_SPEECH_MODEL = "onnx-community/Supertonic-TTS-ONNX";
const NEURAL_SPEECH_VOICE =
  "https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main/voices/F1.bin";

let neuralSpeechPipelinePromise: Promise<NeuralSpeechPipeline> | null = null;

function loadNeuralSpeechPipeline(): Promise<NeuralSpeechPipeline> {
  if (!neuralSpeechPipelinePromise) {
    neuralSpeechPipelinePromise = import("@huggingface/transformers")
      .then(async ({ env, pipeline }) => {
        env.useBrowserCache = true;
        env.useWasmCache = true;
        return (await pipeline("text-to-speech", NEURAL_SPEECH_MODEL)) as NeuralSpeechPipeline;
      })
      .catch((error) => {
        neuralSpeechPipelinePromise = null;
        throw error;
      });
  }
  return neuralSpeechPipelinePromise;
}

export function prepareNeuralSpeech(): void {
  void loadNeuralSpeechPipeline().catch(() => undefined);
}

export async function synthesizeNeuralSpeech(text: string): Promise<Blob> {
  const synthesizer = await loadNeuralSpeechPipeline();
  const output = await synthesizer(text, {
    speaker_embeddings: NEURAL_SPEECH_VOICE,
    num_inference_steps: 5,
    speed: 1.04,
  });
  return await output.toBlob();
}
