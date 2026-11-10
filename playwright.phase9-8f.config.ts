import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8f',outputDir:'artifacts/phase9-8f/browser',timeout:90000,reporter:[['list'],['json',{outputFile:'artifacts/phase9-8f/tests.json'}]]});
