import { fileURLToPath } from "node:url";
import { loadChaosConfig } from "./chaos/config";
import { runChaos } from "./chaos/runner";
import { loadSchedule, totalDurationSeconds } from "./chaos/schedule";
import { runLoad } from "./runner";
import { formatTable } from "./stats";

/**
 * Chaos scheduler entrypoint. Reads a YAML schedule, drives baseline traffic at
 * the gateway for the whole cycle, and on a clock applies/clears each phase's
 * chaos against the model-proxy / retriever control planes. Prints a transcript
 * (phase transitions) plus a final summary, then exits 0. Repeatable.
 */
async function main(): Promise<void> {
  // Default schedule lives at <app>/chaos/full.yaml (sibling of src/).
  const defaultSchedule = fileURLToPath(new URL("../chaos/full.yaml", import.meta.url));
  const config = loadChaosConfig(defaultSchedule);
  const schedule = await loadSchedule(config.schedulePath);
  const totalSeconds = totalDurationSeconds(schedule);

  console.log(
    `[chaos] schedule=${config.schedulePath} phases=${schedule.phases.length} ` +
      `total=${totalSeconds}s baseline=${config.targetQps}qps target=${config.gatewayUrl}`,
  );
  if (schedule.description) console.log(`[chaos] ${schedule.description}`);

  const summary = await runChaos({
    schedule,
    baseUrls: { "model-proxy": config.modelProxyUrl, retriever: config.retrieverUrl },
    log: (msg) => console.log(msg),
    load: () =>
      runLoad({
        config: {
          gatewayUrl: config.gatewayUrl,
          targetQps: config.targetQps,
          durationSeconds: totalSeconds,
          requestTimeoutMs: config.requestTimeoutMs,
          concurrency: config.concurrency,
        },
      }),
  });

  console.log("");
  console.log(formatTable(summary));
  console.log("");
  console.log(JSON.stringify(summary));
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[chaos] fatal:", err);
    process.exit(0);
  });
