#!/bin/sh
set -eu

exec /proc/1/exe -e '
const url = process.env.SANDBOX_RUNNER_HEALTHCHECK_URL || "http://127.0.0.1:" + (process.env.PORT || "2000") + "/api/v2/health";
const timeout = Number(process.env.SANDBOX_RUNNER_HEALTHCHECK_TIMEOUT_SECONDS || "5");
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeout * 1000);

try {
  const response = await fetch(url, { signal: controller.signal });
  const body = await response.text();

  if (!response.ok) {
    console.error("sandbox-runner unhealthy: HTTP " + response.status);
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (_) {
    console.error("sandbox-runner unhealthy: invalid JSON response");
    process.exit(1);
  }

  if (payload?.status !== "healthy") {
    console.error("sandbox-runner unhealthy: unexpected health response");
    process.exit(1);
  }
} catch (error) {
  console.error("sandbox-runner unhealthy: " + (error?.message || error));
  process.exit(1);
} finally {
  clearTimeout(timer);
}
'
