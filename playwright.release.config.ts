import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/release',timeout:180000,outputDir:'artifacts/phase9-8r/browser',reporter:[['list']]});
