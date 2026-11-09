import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-7-ui',outputDir:'artifacts/phase9-7/ui',reporter:[['list'],['json',{outputFile:'artifacts/phase9-7/ui-tests.json'}]]});
