import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/pc-save',timeout:60000,outputDir:'artifacts/pc-save/browser',reporter:[['list']]});
