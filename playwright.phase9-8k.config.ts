import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8k',outputDir:'artifacts/phase9-8k/browser',timeout:240000,reporter:[['list'],['json',{outputFile:'artifacts/phase9-8k/tests.json'}]]});
