// global.d.ts

// We can extend the File interface in TypeScript by declaring a global augmentation. This tells
// TypeScript about additional properties that exist on the File object within our specific
// Electron environment.

declare global {
  interface File {
    path: string; // Add the path property to the File interface
  }
}

export {};
