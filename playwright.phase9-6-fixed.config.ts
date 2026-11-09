import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-6-fixed',outputDir:'artifacts/phase9-6/fixed',reporter:[['list'],['json',{outputFile:'artifacts/phase9-6/fixed-tests.json'}]],timeout:180000,use:{...base.use,serviceWorkers:'block'}});
