import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8h',outputDir:'artifacts/phase9-8h/browser',timeout:120000,reporter:[['list'],['json',{outputFile:'artifacts/phase9-8h/tests.json'}]]});
