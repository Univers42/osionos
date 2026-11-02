// The names a page takes in the file tree. Apart from page-file's codec, so the tree can run on a
// page the node serves, where nothing of the page store may load (editor on disk, F2).

export const PAGE_FILE_SUFFIX = ".omd";
export const FOLDER_META_NAME = "_folder.omd";

export function isPageFileName(name: string): boolean {
  return name.toLowerCase().endsWith(PAGE_FILE_SUFFIX);
}

export function isFolderMetaName(name: string): boolean {
  return name === FOLDER_META_NAME;
}

export function titleFromFileName(name: string): string {
  return isPageFileName(name) ? name.slice(0, -PAGE_FILE_SUFFIX.length) : name;
}
