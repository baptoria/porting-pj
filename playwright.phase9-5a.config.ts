import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-5a',outputDir:'artifacts/phase9-5a/browser',reporter:[['list'],['json',{outputFile:'artifacts/phase9-5a/browser-tests.json'}]]});
