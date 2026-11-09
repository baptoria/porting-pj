import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-1',outputDir:'artifacts/phase9-1/browser',reporter:[['list']],timeout:60000,use:{...base.use,serviceWorkers:'block'}});
