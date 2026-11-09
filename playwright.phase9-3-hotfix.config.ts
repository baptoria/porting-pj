import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-3-hotfix',outputDir:'artifacts/phase9-3-hotfix/browser',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-3-hotfix/cache-tests.json'}]],timeout:60000,
 webServer:{...base.webServer,command:'node scripts/serve-phase9-3-hotfix-test.mjs'}});
