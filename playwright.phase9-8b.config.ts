import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8b',outputDir:'artifacts/phase9-8b/browser',timeout:90000,reporter:[['list'],['json',{outputFile:'artifacts/phase9-8b/tests.json'}]],use:{...base.use,serviceWorkers:'block'}});
