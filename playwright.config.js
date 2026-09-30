import { defineConfig } from '@playwright/test';
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') throw Error('Playwright runs only on the isolated remote runner.');
export default defineConfig({testDir:'./e2e',timeout:45000,expect:{timeout:15000},fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['html',{outputFolder:'.backend-ci/browser-results/report',open:'never'}],['json',{outputFile:'.backend-ci/browser-results/results.json'}]],
  outputDir:'.backend-ci/browser-results/artifacts',use:{baseURL:'http://localhost:4173',browserName:'chromium',locale:'pt-BR',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node scripts/qa/serve-built.mjs',url:'http://localhost:4173/login',reuseExistingServer:false,timeout:30000},
});
