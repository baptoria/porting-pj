import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-6-overhead',outputDir:'artifacts/phase9-6/overhead',reporter:[['list'],['json',{outputFile:'artifacts/phase9-6/overhead-tests.json'}]],timeout:180000,use:{...base.use,serviceWorkers:'block'}});
