import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from './scripts/qa/isolated-runtime.mjs';
import { defineConfig } from '@playwright/test';
assertIsolatedRuntime();
export default defineConfig({testDir:'./e2e',timeout:45000,expect:{timeout:15000},fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['html',{outputFolder:'.backend-ci/browser-results/report',open:'never'}],['json',{outputFile:'.backend-ci/browser-results/results.json'}]],
  outputDir:'.backend-ci/browser-results/artifacts',use:{baseURL:'http://localhost:4173',browserName:'chromium',locale:'pt-BR',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node scripts/qa/serve-built.mjs',url:'http://localhost:4173/login',reuseExistingServer:false,timeout:30000},
});
