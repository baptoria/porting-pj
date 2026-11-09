import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-5b',outputDir:'artifacts/phase9-5b/browser',reporter:[['list'],['json',{outputFile:'artifacts/phase9-5b/public-tests.json'}]],use:{...base.use,serviceWorkers:'block'}});
