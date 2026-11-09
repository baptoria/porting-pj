import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-5b-cache',outputDir:'artifacts/phase9-5b/cache-browser',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-5b/cache-tests.json'}]],timeout:60000,
 webServer:{...base.webServer,command:'node scripts/serve-phase9-5b-cache-test.mjs'}});
