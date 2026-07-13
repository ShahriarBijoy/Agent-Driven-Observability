import { loadConfig } from "./platform/config";
import { runLoad } from "./runner";
import { formatTable } from "./stats";

/**
 * Load generator entrypoint. Drives weighted, chaotic traffic at the gateway,
 * then prints a summary (table + JSON) and exits 0. No telemetry — plain
 * console logging only (ADR-002 §1.4).
 */
async function main(): Promise<void> {
  const config = loadConfig();
  console.log(
    `[load-generator] target=${config.targetQps} qps for ${config.durationSeconds}s ` +
      `against ${config.gatewayUrl} (concurrency=${config.concurrency}, ` +
      `timeout=${config.requestTimeoutMs}ms)`,
  );
  if (config.scenarios) {
    const mix = config.scenarios.map((s) => `${s.name}:${s.weight}`).join(", ");
    console.log(`[load-generator] custom scenario mix: ${mix}`);
  }

  const summary = await runLoad({ config });

  console.log("");
  console.log(formatTable(summary));
  console.log("");
  console.log(JSON.stringify(summary));
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[load-generator] fatal:", err);
    process.exit(0);
  });
