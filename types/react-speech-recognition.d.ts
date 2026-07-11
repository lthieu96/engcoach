// Minimal ambient types for react-speech-recognition (ships none). Only what we use.
declare module "react-speech-recognition" {
  export interface ListeningOptions {
    continuous?: boolean;
    language?: string;
  }
  export function useSpeechRecognition(): {
    transcript: string;
    listening: boolean;
    resetTranscript: () => void;
    browserSupportsSpeechRecognition: boolean;
    isMicrophoneAvailable: boolean;
  };
  const SpeechRecognition: {
    startListening: (options?: ListeningOptions) => Promise<void>;
    stopListening: () => Promise<void>;
    abortListening: () => Promise<void>;
  };
  export default SpeechRecognition;
}
