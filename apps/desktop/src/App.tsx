import { useEffect, useState } from "react";
import { RecordingHUD } from "./pages/RecordingHUD";
import { Editor } from "./pages/Editor";
import { SourceSelector } from "./pages/SourceSelector";

type WindowType = "hud-overlay" | "source-selector" | "editor" | "";

export default function App() {
	const [windowType, setWindowType] = useState<WindowType>("");

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const type = (params.get("windowType") || "") as WindowType;
		setWindowType(type);

		// Transparent background for overlay windows
		if (type === "hud-overlay" || type === "source-selector") {
			document.body.style.background = "transparent";
			document.documentElement.style.background = "transparent";
			const root = document.getElementById("root");
			if (root) root.style.background = "transparent";
		}
	}, []);

	switch (windowType) {
		case "hud-overlay":
			return <RecordingHUD />;
		case "source-selector":
			return <SourceSelector />;
		case "editor":
			return <Editor />;
		default:
			return (
				<div className="animate-fade-in" style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100vh",
					background: "var(--surface-base)",
					color: "var(--text-primary)",
				}}>
					<div className="animate-pulse">Loading Scope...</div>
				</div>
			);
	}
}
