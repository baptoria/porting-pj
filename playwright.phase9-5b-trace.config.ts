import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-5b-trace',outputDir:'artifacts/phase9-5b/trace-browser',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-5b/trace-tests.json'}]],timeout:60000,use:{...base.use,serviceWorkers:'block'}});
