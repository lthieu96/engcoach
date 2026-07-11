import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kokoro TTS (kokoro-js → @huggingface/transformers → sharp / onnxruntime-node
  // native binaries) runs only in the browser via dynamic import. Keep it out of
  // the server bundle so it isn't pulled into the serverless functions — it's
  // never executed server-side.
  serverExternalPackages: ["kokoro-js", "@huggingface/transformers", "sharp", "onnxruntime-node"],
};

export default nextConfig;
