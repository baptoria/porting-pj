import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8',outputDir:'artifacts/phase9-8/ui',reporter:[['list'],['json',{outputFile:'artifacts/phase9-8/ui-tests.json'}]],use:{...base.use,hasTouch:true,isMobile:true,viewport:{width:844,height:390}}});
