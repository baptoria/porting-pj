import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8g',outputDir:'artifacts/phase9-8g/browser',timeout:90000,reporter:[['list'],['json',{outputFile:'artifacts/phase9-8g/tests.json'}]]});
