export type BrickVerseApp = "client" | "creator";
export type ReleaseBranch = "main" | "prod" | "beta";
export type InstallerAction = "install" | "uninstall";

export interface InstallRequest {
  app: BrickVerseApp;
  branch: ReleaseBranch;
  createDesktopShortcut: boolean;
}

export interface InstallState {
  installed: boolean;
  installDirectory: string;
  executablePath?: string;
  version?: string;
}

export interface ProgressEvent {
  phase: "checking" | "downloading" | "extracting" | "installing" | "shortcut" | "uninstalling" | "complete" | "error";
  percent: number;
  message: string;
  transferredBytes?: number;
  totalBytes?: number;
}

export interface BinaryApiPayload {
  url: string;
  createdAt: string;
}
