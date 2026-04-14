// ============================================================================
// Offscreen Document — MediaRecorder host for Chrome Extension
//
// This page runs in a hidden offscreen context. The service worker sends
// stream IDs from tabCapture / desktopCapture, and this document:
//   1. Acquires the actual MediaStream from the stream ID
//   2. Records it using MediaRecorder (WebM / VP9)
//   3. Saves the recording to chrome.storage.local as a base64 blob
//   4. Notifies the service worker when recording is complete
// ============================================================================

/// <reference types="chrome" />

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let mediaStream: MediaStream | null = null;

// ---------------------------------------------------------------------------
// Message Handling
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	switch (message.action) {
		case "offscreen-start-recording":
			startRecording(message.streamId, message.type)
				.then(() => sendResponse({ success: true }))
				.catch((err) => sendResponse({ success: false, error: String(err) }));
			return true;

		case "offscreen-stop-recording":
			stopRecording();
			sendResponse({ success: true });
			return false;

		case "offscreen-get-status":
			sendResponse({
				recording: mediaRecorder?.state === "recording",
				paused: mediaRecorder?.state === "paused",
			});
			return false;

		default:
			return false;
	}
});

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

async function startRecording(streamId: string, type: "tab" | "desktop") {
	// Acquire the stream from the stream ID
	const constraints: MediaStreamConstraints = {
		audio: type === "tab" ? {
			// @ts-ignore — Chrome-specific constraint for tab audio
			mandatory: {
				chromeMediaSource: "tab",
				chromeMediaSourceId: streamId,
			},
		} : false,
		video: {
			// @ts-ignore — Chrome-specific constraint
			mandatory: {
				chromeMediaSource: type === "tab" ? "tab" : "desktop",
				chromeMediaSourceId: streamId,
				maxWidth: 3840,
				maxHeight: 2160,
				maxFrameRate: 60,
			},
		} as any,
	};

	mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
	recordedChunks = [];

	// Select best codec
	const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
		? "video/webm;codecs=vp9,opus"
		: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
		? "video/webm;codecs=vp9"
		: "video/webm;codecs=vp8";

	mediaRecorder = new MediaRecorder(mediaStream, {
		mimeType,
		videoBitsPerSecond: 6_000_000,
	});

	mediaRecorder.ondataavailable = (event) => {
		if (event.data.size > 0) {
			recordedChunks.push(event.data);
		}
	};

	mediaRecorder.onstop = async () => {
		// Stop all tracks
		if (mediaStream) {
			for (const track of mediaStream.getTracks()) {
				track.stop();
			}
			mediaStream = null;
		}

		if (recordedChunks.length === 0) return;

		// Create blob
		const blob = new Blob(recordedChunks, { type: mimeType });
		recordedChunks = [];

		// Convert to base64 for storage
		const arrayBuffer = await blob.arrayBuffer();
		const base64 = arrayBufferToBase64(arrayBuffer);

		// Store in chrome.storage.local
		const timestamp = Date.now();
		const key = `recording_${timestamp}`;

		await chrome.storage.local.set({
			[key]: {
				data: base64,
				mimeType,
				timestamp,
				size: blob.size,
			},
			latestRecordingKey: key,
		});

		// Notify service worker
		chrome.runtime.sendMessage({
			action: "recording-complete",
			key,
			size: blob.size,
			timestamp,
		});
	};

	mediaRecorder.start(1000); // Chunk every 1 second

	// Notify service worker recording started
	chrome.runtime.sendMessage({
		action: "recording-started",
		type,
	});
}

function stopRecording() {
	if (mediaRecorder && mediaRecorder.state !== "inactive") {
		mediaRecorder.stop();
	}
	mediaRecorder = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 8192;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}
