import path from "path";
import type { NextConfig } from "next";

// Fail fast on missing config instead of silently falling back to a baked-in
// project. The previous hardcoded values risked pointing a deploy at the wrong
// Supabase project and masked unset env vars. Required vars are documented in
// .env.local.example.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.local.example.`,
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // `@huggingface/transformers` is used ONLY in the browser (client-side dynamic
  // import → onnxruntime-web/WASM/WebGPU). Its `onnxruntime-node` dependency ships
  // ~208MB of native binaries that are never used server-side; without this
  // exclude, Next's file tracing can pull them into a serverless function bundle
  // and blow Vercel's 250MB unzipped limit, failing the deploy.
  outputFileTracingExcludes: {
    "*": [
      "**/node_modules/onnxruntime-node/**",
      "**/node_modules/@huggingface/transformers/**",
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
