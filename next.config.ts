import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kokoro TTS (kokoro-js → @huggingface/transformers → sharp / onnxruntime-node
  // native binaries) runs only in the browser via dynamic import. Keep it out of
  // the server bundle so the OpenNext/Cloudflare esbuild pass doesn't try to
  // bundle `.node` files — it's never executed server-side.
  serverExternalPackages: ["kokoro-js", "@huggingface/transformers", "sharp", "onnxruntime-node"],
};

export default nextConfig;
