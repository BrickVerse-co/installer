import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
	BrickVerseApp,
	InstallState,
	ProgressEvent,
	ReleaseBranch,
} from "../main/types";
import "../assets/style.css";
import logoUrl from "../assets/logo.png";

type WizardStep = "welcome" | "options" | "progress" | "complete";

const products: Array<{
	id: BrickVerseApp;
	title: string;
	description: string;
}> = [
	{
		id: "client",
		title: "BrickVerse Game Client",
		description:
			"Install the BrickVerse application used to play worlds and experiences.",
	},
	{
		id: "creator",
		title: "BrickVerse Creator",
		description:
			"Install the BrickVerse development environment used to build and publish worlds.",
	},
];

function App(): React.JSX.Element {
	const [step, setStep] = useState<WizardStep>("welcome");
	const [selected, setSelected] = useState<BrickVerseApp>("client");
	const [branch, setBranch] = useState<ReleaseBranch>("main");
	const [createShortcut, setCreateShortcut] = useState(true);
	const [createStartMenuShortcut, setCreateStartMenuShortcut] = useState(true);
	const [autoUpdate, setAutoUpdate] = useState(true);
	const [customInstallDirectory, setCustomInstallDirectory] = useState("");
	const [states, setStates] = useState<
		Record<BrickVerseApp, InstallState | null>
	>({
		client: null,
		creator: null,
	});
	const [progress, setProgress] = useState<ProgressEvent | null>(null);
	const [busy, setBusy] = useState(false);
	const [operation, setOperation] = useState<"install" | "update" | "uninstall">(
		"install",
	);
	const [version, setVersion] = useState("");

	const selectedProduct = useMemo(
		() => products.find((product) => product.id === selected)!,
		[selected],
	);

	const selectedState = states[selected];
	const isInstalled = selectedState?.installed === true;

	async function refreshStates(): Promise<void> {
		const [client, creator, installerVersion] = await Promise.all([
			window.brickverse.getState("client"),
			window.brickverse.getState("creator"),
			window.brickverse.getVersion(),
		]);

		setStates({ client, creator });
		setVersion(installerVersion);
	}

	useEffect(() => {
		void refreshStates();

		const removeProgress = window.brickverse.onProgress((event) => {
			setProgress(event);

			if (event.phase === "complete") {
				setStep("complete");
			}
		});

		return removeProgress;
	}, []);

	function beginConfiguration(): void {
		setOperation(isInstalled ? "update" : "install");
		setCustomInstallDirectory(selectedState?.installDirectory ?? "");
		setAutoUpdate(selectedState?.autoUpdate ?? true);
		setBranch(selectedState?.branch ?? "main");
		setProgress(null);
		setStep("options");
	}

	async function runOperation(): Promise<void> {
		setBusy(true);
		setStep("progress");
		setProgress({
			phase: operation !== "uninstall" ? "checking" : "uninstalling",
			percent: 0,
			message:
				operation !== "uninstall"
					? "Preparing installation..."
					: "Preparing uninstall...",
		});

		try {
			if (operation !== "uninstall") {
				const installed = await window.brickverse.install({
					app: selected,
					branch,
					createDesktopShortcut: createShortcut,
					createStartMenuShortcut,
					installDirectory: customInstallDirectory,
					autoUpdate,
				});

				setStates((current) => ({
					...current,
					[selected]: installed,
				}));
			} else {
				const removed = await window.brickverse.uninstall(selected);

				setStates((current) => ({
					...current,
					[selected]: removed,
				}));
			}
		} catch (error) {
			setProgress({
				phase: "error",
				percent: 0,
				message: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(false);
		}
	}

	function finish(): void {
		window.close();
	}

	function renderPage(): React.JSX.Element {
		if (step === "welcome") {
			return (
				<>
					<div className="wizardTitle">
						<h1>BrickVerse Setup</h1>
						<p>
							Install, update, repair, or remove BrickVerse applications from
							your computer.
						</p>
					</div>

					<div className="wizardBody">
						<p className="introText">
							Select the application you want to manage, then click Next.
						</p>

						<div className="selectionList">
							{products.map((product) => {
								const installed = states[product.id]?.installed;

								return (
									<label
										key={product.id}
										className={`selectionRow ${
											selected === product.id ? "selected" : ""
										}`}
									>
										<input
											type="radio"
											name="product"
											value={product.id}
											checked={selected === product.id}
											onChange={() => setSelected(product.id)}
										/>

										<span className="selectionContent">
											<strong>{product.title}</strong>
											<span>{product.description}</span>
										</span>

										<span className="installState">
											{installed ? "Installed" : "Not installed"}
										</span>
									</label>
								);
							})}
						</div>

						<div className="productSummary">
							<strong>{selectedProduct.title}</strong>
							<span>
								{isInstalled
									? `Currently installed in ${selectedState?.installDirectory}`
									: "This application is not currently installed."}
							</span>
						</div>
					</div>
				</>
			);
		}

		if (step === "options") {
			return (
				<>
					<div className="wizardTitle">
						<h1>
							{operation !== "uninstall"
								? `${operation === "update" ? "Update or repair" : "Install"} ${selectedProduct.title}`
								: `Uninstall ${selectedProduct.title}`}
						</h1>
						<p>
							{operation !== "uninstall"
								? "Choose your installation options."
								: "Confirm that you want to remove this application."}
						</p>
					</div>

					<div className="wizardBody">
						{operation !== "uninstall" ? (
							<div className="formGroup">
								<label className="fieldLabel" htmlFor="branch">
									Release channel
								</label>

								<select
									id="branch"
									value={branch}
									onChange={(event) =>
										setBranch(event.target.value as ReleaseBranch)
									}
								>
									<option value="main">Main</option>
									<option value="beta">Beta</option>
								</select>

								<label className="fieldLabel locationLabel" htmlFor="installLocation">Install location</label>
								<div className="locationRow">
									<input id="installLocation" value={customInstallDirectory} onChange={(event) => setCustomInstallDirectory(event.target.value)} />
									<button className="button secondary" type="button" onClick={async () => {
										const directory = await window.brickverse.chooseDirectory(customInstallDirectory);
										if (directory) setCustomInstallDirectory(directory);
									}}>Browse...</button>
								</div>

								<label className="checkboxRow">
									<input
										type="checkbox"
										checked={createShortcut}
										onChange={(event) =>
											setCreateShortcut(event.target.checked)
										}
									/>
									<span>Create a desktop shortcut</span>
								</label>

								<label className="checkboxRow">
									<input type="checkbox" checked={createStartMenuShortcut} onChange={(event) => setCreateStartMenuShortcut(event.target.checked)} />
									<span>Create an application menu shortcut</span>
								</label>

								<label className="checkboxRow">
									<input type="checkbox" checked={autoUpdate} onChange={(event) => setAutoUpdate(event.target.checked)} />
									<span>Automatically update before launching</span>
								</label>

								<div className="installInfo">
									<div>
										<span className="infoLabel">Application</span>
										<strong>{selectedProduct.title}</strong>
									</div>

									<div>
										<span className="infoLabel">Install location</span>
										<strong>{customInstallDirectory}</strong>
									</div>
								</div>
							</div>
						) : (
							<div className="confirmPanel">
								<p>
									BrickVerse Setup will remove{" "}
									<strong>{selectedProduct.title}</strong> from this computer.
								</p>

								<p>
									The installed application files and shortcuts will be removed.
									Your account and cloud data will not be deleted.
								</p>

								<div className="installInfo">
									<div>
										<span className="infoLabel">Installed location</span>
										<strong>{selectedState?.installDirectory}</strong>
									</div>
								</div>
							</div>
						)}
					</div>
				</>
			);
		}

		if (step === "progress") {
			const hasError = progress?.phase === "error";

			return (
				<>
					<div className="wizardTitle">
						<h1>
							{hasError
								? "Setup could not continue"
								: operation !== "uninstall"
									? `${operation === "update" ? "Updating" : "Installing"} ${selectedProduct.title}`
									: `Uninstalling ${selectedProduct.title}`}
						</h1>
						<p>
							{hasError
								? "Review the error below."
								: "Please wait while BrickVerse Setup completes the operation."}
						</p>
					</div>

					<div className="wizardBody">
						<div className={`progressPanel ${hasError ? "error" : ""}`}>
							<span className="progressMessage">
								{progress?.message ?? "Preparing..."}
							</span>

							{!hasError && (
								<>
									<div className="progressTrack">
										<div
											className="progressBar"
											style={{ width: `${progress?.percent ?? 0}%` }}
										/>
									</div>

									<span className="progressPercent">
										{progress?.percent ?? 0}%
									</span>
								</>
							)}
						</div>
					</div>
				</>
			);
		}

		return (
			<>
				<div className="wizardTitle">
					<h1>
						{operation !== "uninstall"
							? operation === "update" ? "Update complete" : "Installation complete"
							: "Uninstall complete"}
					</h1>
					<p>BrickVerse Setup has finished.</p>
				</div>

				<div className="wizardBody">
					<div className="completePanel">
						<div className="completeIcon">✓</div>

						<div>
							<strong>
								{operation !== "uninstall"
									? `${selectedProduct.title} was ${operation === "update" ? "updated" : "installed"} successfully.`
									: `${selectedProduct.title} was removed successfully.`}
							</strong>

							<p>
								{operation !== "uninstall"
									? "You can launch it now or close this setup wizard."
									: "Click Finish to close BrickVerse Setup."}
							</p>
						</div>
					</div>
				</div>
			</>
		);
	}

	return (
		<main className="wizardWindow">
			<div className="wizardHeader">
				<img
					className="wizardLogo"
					src={logoUrl}
					alt="BrickVerse Logo"
					draggable={false}
				/>

				<div className="wizardHeaderText">
					<strong>BrickVerse Installer</strong>
					<span>Version {version}</span>
				</div>
			</div>

			<section className="wizardPage">{renderPage()}</section>

			<footer className="wizardFooter">
				<div className="footerLeft">© 2026 Meta Games LLC</div>

				<div className="footerButtons">
					{step === "welcome" && (
						<>
							<button className="button secondary" onClick={finish}>
								Cancel
							</button>

							<button
								className="button primary"
								onClick={beginConfiguration}
								disabled={selectedState === null}
							>
								Next &gt;
							</button>
						</>
					)}

					{step === "options" && (
						<>
							<button
								className="button secondary"
								onClick={() => setStep("welcome")}
							>
								&lt; Back
							</button>

							<button className="button secondary" onClick={finish}>
								Cancel
							</button>

							<button
								className={`button ${
									operation === "uninstall" ? "danger" : "primary"
								}`}
								onClick={() => void runOperation()}
							>
								{operation === "install" ? "Install" : operation === "update" ? "Update / Repair" : "Uninstall"}
							</button>
							{operation === "update" && (
								<button className="button danger" onClick={() => setOperation("uninstall")}>Uninstall...</button>
							)}
						</>
					)}

					{step === "progress" && progress?.phase === "error" && (
						<>
							<button
								className="button secondary"
								onClick={() => setStep("options")}
							>
								&lt; Back
							</button>

							<button className="button primary" onClick={finish}>
								Close
							</button>
						</>
					)}

					{step === "progress" && progress?.phase !== "error" && (
						<button className="button secondary" disabled>
							{busy ? "Please wait..." : "Finishing..."}
						</button>
					)}

					{step === "complete" && operation !== "uninstall" && (
						<>
							<button
								className="button secondary"
								onClick={() => void window.brickverse.launch(selected)}
							>
								Launch
							</button>

							<button className="button primary" onClick={finish}>
								Finish
							</button>
						</>
					)}

					{step === "complete" && operation === "uninstall" && (
						<button className="button primary" onClick={finish}>
							Finish
						</button>
					)}
				</div>
			</footer>
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<App />);
