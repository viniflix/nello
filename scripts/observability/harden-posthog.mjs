import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.codex-local', 'observability.env');
const localEnv = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [
            line.slice(0, index).trim(),
            line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2'),
          ];
        }),
    )
  : {};

const env = { ...localEnv, ...process.env };
const required = ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID'];
const missing = required.filter((key) => !env[key]);
if (missing.length) throw new Error(`Missing ${missing.join(', ')} in ${envPath}`);

const host = (env.POSTHOG_API_HOST || 'https://us.posthog.com')
  .replace('://us.i.', '://us.')
  .replace('://eu.i.', '://eu.')
  .replace(/\/$/, '');
const endpoint = `${host}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/`;
const headers = {
  Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
  'Content-Type': 'application/json',
};

const beforeResponse = await fetch(endpoint, { headers });
if (!beforeResponse.ok) throw new Error(`PostHog read failed with ${beforeResponse.status}`);
const before = await beforeResponse.json();

const desired = {
  anonymize_ips: true,
  session_recording_opt_in: false,
  capture_console_log_opt_in: false,
};

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({
    mode: 'read-only',
    current: {
      anonymize_ips: before.anonymize_ips,
      session_recording_opt_in: before.session_recording_opt_in,
      capture_console_log_opt_in: before.capture_console_log_opt_in,
    },
    desired,
  }, null, 2));
  process.exit(0);
}

const updateResponse = await fetch(endpoint, {
  method: 'PATCH',
  headers,
  body: JSON.stringify(desired),
});
if (!updateResponse.ok) throw new Error(`PostHog update failed with ${updateResponse.status}`);
const updated = await updateResponse.json();

const verified = Object.entries(desired).every(([key, value]) => updated[key] === value);
if (!verified) throw new Error('PostHog returned settings that do not match the privacy policy.');
console.log(JSON.stringify({ mode: 'applied', verified, settings: desired }, null, 2));
