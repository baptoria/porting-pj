import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-6-cache',outputDir:'artifacts/phase9-6/cache-browser',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-6/cache-tests.json'}]],timeout:60000,
 webServer:{...base.webServer,command:'node scripts/serve-phase9-6-cache-test.mjs'}});
