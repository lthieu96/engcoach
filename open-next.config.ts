// Required by @opennextjs/cloudflare — `opennextjs-cloudflare build` reads this
// to produce `.open-next/` (worker.js + assets/). Minimal config: no incremental
// cache override (fine for the $0 tier; add R2/KV here later if caching matters).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
