// Vite's `?raw` imports (the worker's tsconfig has no Vite or Astro client types).
declare module "*?raw" {
  const content: string;
  export default content;
}
