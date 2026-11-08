import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/pages',outputDir:'test-results-pages',reporter:[['list']],timeout:60000});
