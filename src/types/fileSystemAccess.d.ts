/** Minimal typings for File System Access API (folder picker + writable streams). */

export {}

declare global {
  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | BufferSource | Blob): Promise<void>
    close(): Promise<void>
  }

  interface FileSystemFileHandle {
    getFile(): Promise<File>
    createWritable(): Promise<FileSystemWritableFileStream>
  }

  interface FileSystemDirectoryHandle {
    getFileHandle(name: string): Promise<FileSystemFileHandle>
    getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>
  }

  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}
