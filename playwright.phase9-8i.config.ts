import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8i',outputDir:'artifacts/phase9-8i/browser',timeout:120000,reporter:[['list'],['json',{outputFile:'artifacts/phase9-8i/tests.json'}]]});
