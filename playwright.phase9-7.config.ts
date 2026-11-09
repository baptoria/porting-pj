import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-7',outputDir:'artifacts/phase9-7/browser',reporter:[['list'],['json',{outputFile:'artifacts/phase9-7/browser-tests.json'}]],use:{...base.use,serviceWorkers:'block'}});
