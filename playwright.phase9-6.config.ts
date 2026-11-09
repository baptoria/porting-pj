import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-6',outputDir:'artifacts/phase9-6/browser',reporter:[['list'],['json',{outputFile:'artifacts/phase9-6/public-tests.json'}]],use:{...base.use,serviceWorkers:'block'}});
