import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8c',outputDir:'artifacts/phase9-8c/browser',reporter:[['list'],['json',{outputFile:'artifacts/phase9-8c/tests.json'}]]});
