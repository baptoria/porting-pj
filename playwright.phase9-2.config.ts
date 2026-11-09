import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-2',outputDir:'artifacts/phase9-2/browser',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-2/public-tests.json'}]],
 timeout:60000,use:{...base.use,serviceWorkers:'block'}});
