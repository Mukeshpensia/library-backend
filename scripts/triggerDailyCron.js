// scripts/triggerDailyCron.js
// Standalone trigger for POST /cron/daily, run by an external scheduler (e.g. a
// Render Cron Job) because the free-tier web service sleeps and its in-process
// node-cron can't fire reliably. Uses Node's global fetch (Node >= 18), so it
// needs no dependencies installed.
//
// Env:
//   CRON_SECRET      (required) — must match the web service's CRON_SECRET
//   CRON_HOST        host of the web service, e.g. my-app.onrender.com
//   CRON_TARGET_URL  full URL override (used instead of CRON_HOST if set)

const secret = process.env.CRON_SECRET;
const host = process.env.CRON_HOST;
const url = process.env.CRON_TARGET_URL || (host ? `https://${host}/api/v1/cron/daily` : null);

async function main() {
    if (!secret || !url) {
        console.error('CRON_SECRET and CRON_HOST (or CRON_TARGET_URL) must be set.');
        process.exit(1);
    }

    console.log(`Triggering daily jobs: POST ${url}`);
    // No explicit timeout: a sleeping free-tier service needs a cold start
    // (~30-60s) before it responds, and fetch waits for that by default.
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-cron-secret': secret },
    });

    const body = await res.text();
    if (!res.ok) {
        console.error(`Cron trigger failed: ${res.status} ${body}`);
        process.exit(1);
    }
    console.log(`Cron trigger OK: ${body}`);
}

main().catch((err) => {
    console.error('Cron trigger error:', err);
    process.exit(1);
});
