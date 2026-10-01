import {defineConfig} from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir:'./tests/browser',globalSetup:'./tests/e2e-setup.ts',fullyParallel:false,workers:1,
  timeout:60000,expect:{timeout:15000},use:{baseURL:'http://localhost:3100',headless:true,trace:'retain-on-failure',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}},
  webServer:{command:'npm run dev -- --port 3100',url:'http://localhost:3100',timeout:120000,reuseExistingServer:false,env:{APP_URL:'http://localhost:3100',PLAYWRIGHT_TEST:'1',TEST_DATABASE_DIR:path.resolve('.test-db/browser'),DATABASE_URL:'',NEXT_TELEMETRY_DISABLED:'1'}},
  reporter:[['list'],['html',{open:'never'}]]
});
