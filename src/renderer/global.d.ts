import type {
  AutoLaunchState,
  BrickVerseApp,
  InstallRequest,
  InstallState,
  ProgressEvent
} from "../main/types";

declare global {
  interface Window {
    brickverse: {
      platform: "win32" | "darwin" | "linux";
      getState(target: BrickVerseApp): Promise<InstallState>;
	  chooseDirectory(current?: string): Promise<string | null>;
      install(request: InstallRequest): Promise<InstallState>;
      uninstall(target: BrickVerseApp): Promise<InstallState>;
      launch(target: BrickVerseApp): Promise<void>;
      openFolder(target: BrickVerseApp): Promise<void>;
      getVersion(): Promise<string>;
      getRequestedProduct(): Promise<BrickVerseApp | null>;
      getAutoLaunchState(): Promise<AutoLaunchState | null>;
      onAutoLaunch(callback: (state: AutoLaunchState) => void): () => void;
      onSelectProduct(callback: (target: BrickVerseApp | null) => void): () => void;
      onProgress(callback: (event: ProgressEvent) => void): () => void;
      onUpdaterStatus(callback: (status: string) => void): () => void;
    };
  }
}

export {};
