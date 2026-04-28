// File System Access API methods missing from TypeScript's bundled DOM lib.
// Spec: https://wicg.github.io/file-system-access/

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemDirectoryHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}
