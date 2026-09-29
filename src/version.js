/* global __ZCF_VERSION__ */
// The script's version, put in by the build from package.json ('dev' if run unbundled).
export const VERSION = typeof __ZCF_VERSION__ === 'string' ? __ZCF_VERSION__ : 'dev';

// The author's Zed City player, linked from the bottom of Chat settings ("Become friends or enemies with the dev!").
export const DEV_PROFILE_ID = 27581;
