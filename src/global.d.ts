// global.d.ts

// We can extend the File interface in TypeScript by declaring a global augmentation. This tells
// TypeScript about additional properties that exist on the File object within our specific
// Electron environment.

declare global {
  interface File {
    path: string; // Add the path property to the File interface
  }
}

// If you have a file that doesn’t currently have any imports or exports, but you want to be treated as a module, add the line:
export {};
