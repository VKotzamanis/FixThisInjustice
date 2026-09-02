/*
 * Types for scripts/inline-icons.mjs, which is plain Node ESM and sits outside the TypeScript
 * project. The generator is not compiled; this file exists so the drift test in
 * src/skins/limelight/icons.test.ts can import the builders and regenerate in-process, instead of
 * spawning the script or duplicating its logic.
 */

/** Absolute path of the source directory holding the 32x32 icon PNGs. */
export declare const ICON_DIR: string;

/** Absolute path of the source directory holding the 256x256 mascot PNGs. */
export declare const ART_DIR: string;

/** Absolute path of the generated icon module. */
export declare const ICON_OUT: string;

/** Absolute path of the generated illustration module. */
export declare const ART_OUT: string;

/** The text of src/skins/limelight/icons.ts, rebuilt from agy-artifacts/icons/*.png. Writes nothing. */
export declare function buildIconsModule(): string;

/** The text of src/skins/limelight/illustrations.ts, rebuilt from the mascot PNGs. Writes nothing. */
export declare function buildIllustrationsModule(): string;
