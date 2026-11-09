import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8d',outputDir:'artifacts/phase9-8d/browser',reporter:[['list'],['json',{outputFile:'artifacts/phase9-8d/tests.json'}]]});
