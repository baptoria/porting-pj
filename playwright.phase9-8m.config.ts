import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8m',outputDir:'artifacts/phase9-8m/browser',reporter:[['list']],timeout:60000});
