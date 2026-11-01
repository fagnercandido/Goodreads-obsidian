import { App, Modal, Notice } from "obsidian";
import { t } from "./i18n";

/**
 * True when the platform can scan a barcode from the camera in-app.
 * Relies on the native BarcodeDetector API (Chromium desktop / Android).
 * iOS WebKit inside Obsidian does NOT support this - use the Shortcut
 * inbox flow there instead.
 */
export function isCameraScanSupported(): boolean {
    const w = window as any;
    return typeof w.BarcodeDetector !== 'undefined'
        && !!navigator.mediaDevices
        && typeof navigator.mediaDevices.getUserMedia === 'function';
}

/**
 * Opens a modal with the camera feed and resolves with the first book
 * barcode (EAN-13) it detects, or null if the user cancels / it fails.
 */
export class BarcodeScanModal extends Modal {
    private stream: MediaStream | null = null;
    private video: HTMLVideoElement | null = null;
    private detector: any = null;
    private intervalId: number | null = null;
    private settled = false;

    constructor(app: App, private onResult: (isbn: string | null) => void) {
        super(app);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.addClass('goodreads-scan-modal');
        contentEl.createEl('h3', { text: t('SCAN_TITLE') });
        const hint = contentEl.createEl('p', { text: t('SCAN_HINT'), cls: 'goodreads-scan-hint' });

        if (!isCameraScanSupported()) {
            hint.setText(t('SCAN_UNSUPPORTED'));
            return;
        }

        const w = window as any;
        try {
            this.detector = new w.BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e']
            });
        } catch (e) {
            hint.setText(t('SCAN_UNSUPPORTED'));
            return;
        }

        this.video = contentEl.createEl('video', { cls: 'goodreads-scan-video' });
        this.video.setAttribute('playsinline', 'true');
        this.video.muted = true;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            // The modal may have been closed while getUserMedia was pending
            // (e.g. the user dismissed the permission prompt). Don't light up a
            // live camera on a dead modal.
            if (this.settled) { this.stopStream(); return; }
            this.video.srcObject = this.stream;
            await this.video.play();
            if (this.settled) { this.stopStream(); return; }
        } catch (e) {
            console.error('Camera access failed:', e);
            hint.setText(t('SCAN_CAMERA_DENIED'));
            this.stopStream();
            return;
        }

        this.intervalId = window.setInterval(() => this.tick(), 300);
    }

    private async tick() {
        if (!this.detector || !this.video || this.settled) return;
        try {
            const codes = await this.detector.detect(this.video);
            if (codes && codes.length) {
                const raw: string = codes[0].rawValue || '';
                if (raw) this.finish(raw);
            }
        } catch (e) {
            // Transient decode errors are expected between frames; ignore.
        }
    }

    private finish(isbn: string | null) {
        if (this.settled) return;
        this.settled = true;
        if (isbn) new Notice(t('SCAN_DETECTED', { isbn }));
        this.onResult(isbn);
        this.close();
    }

    private stopStream() {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    onClose() {
        this.stopStream();
        this.contentEl.empty();
        // If the user closed the modal without a hit, report cancellation.
        if (!this.settled) {
            this.settled = true;
            this.onResult(null);
        }
    }
}
