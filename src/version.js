/* global __ZCF_VERSION__ */
// The script's version, put in by the build from package.json ('dev' if run unbundled).
export const VERSION = typeof __ZCF_VERSION__ === 'string' ? __ZCF_VERSION__ : 'dev';

// The author's Zed City player, linked from the bottom of Chat settings ("Become friends or enemies with the dev!").
export const DEV_PROFILE_ID = 27581;

// Where the script updates from (build.mjs writes it as @updateURL and @downloadURL). Chat settings →
// About → Check for updates reads its header, and Update now opens it for Tampermonkey.
export const UPDATE_URL = 'https://raw.githubusercontent.com/Dickie1242/Zed-City-Friends/main/dist/zed-city-friends.user.js';
