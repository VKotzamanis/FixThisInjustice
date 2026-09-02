// Vitest runs through Vite, so `import text from "../file.ext?raw"` yields the file's
// contents as a string. Declared here because the worker package does not depend on Vite.
declare module "*?raw" {
  const content: string;
  export default content;
}
