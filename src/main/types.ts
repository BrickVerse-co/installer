export type BrickVerseApp = "client" | "creator" | "guild-chat";
export type ReleaseBranch = "main" | "prod" | "beta";
export type InstallerAction = "install" | "update" | "repair" | "uninstall";

export interface InstallRequest {
  app: BrickVerseApp;
  branch: ReleaseBranch;
  createDesktopShortcut: boolean;
  createStartMenuShortcut: boolean;
  installDirectory?: string;
  autoUpdate: boolean;
}

export interface InstallState {
  installed: boolean;
  installDirectory: string;
  executablePath?: string;
  version?: string;
  branch?: ReleaseBranch;
  autoUpdate?: boolean;
}

export interface ProgressEvent {
  phase: "checking" | "downloading" | "extracting" | "installing" | "updating" | "shortcut" | "uninstalling" | "complete" | "error";
  percent: number;
  message: string;
  transferredBytes?: number;
  totalBytes?: number;
}

export interface AutoLaunchState {
  active: boolean;
  target: BrickVerseApp;
  progress: ProgressEvent;
}

export interface BinaryApiPayload {
  url: string;
  createdAt: string;
}

export interface ResolvedBinary extends BinaryApiPayload {
  format: "zip" | "nsis";
}
