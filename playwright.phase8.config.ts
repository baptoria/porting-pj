import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/analysis',outputDir:'artifacts/phase8/browser',reporter:[['list']],timeout:60000});
