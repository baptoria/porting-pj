import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-5b-ui',outputDir:'artifacts/phase9-5b/ui',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-5b/ui-tests.json'}]],timeout:60000});
