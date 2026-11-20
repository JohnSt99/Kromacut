import { useEffect, useRef, useState } from 'react';
import type { ThresholdBands } from '../lib/thresholds';
import type { CanvasPreviewHandle } from '../components/CanvasPreview';

export type ThresholdRenderer = CanvasPreviewHandle['renderThresholdImage'];
export type ThresholdPreview = ImageBitmap | HTMLCanvasElement;

export function releaseThresholdPreview(preview: ThresholdPreview | Blob | null) {
    if (preview instanceof HTMLCanvasElement) preview.width = preview.height = 1;
    else if (preview && !(preview instanceof Blob)) preview.close();
}

/** Paint completed frames in order and replace the queued frame when dragging. */
export function useThresholdPreview(
    source: HTMLCanvasElement | null,
    bands: ThresholdBands,
    render: ThresholdRenderer
) {
    const [frame, setFrame] = useState<ThresholdPreview | null>(null);
    const [error, setError] = useState(false);
    const update = useRef<((next: ThresholdBands) => void) | null>(null);

    useEffect(() => {
        setFrame(null);
        setError(false);
        if (!source) return;
        const controller = new AbortController();
        let running = false;
        let queued: ThresholdBands | null = null;

        async function dispatch() {
            if (running || !queued || controller.signal.aborted || !source) return;
            running = true;
            const next = queued;
            queued = null;
            try {
                const result = await render(source, next, 'preview', controller.signal);
                if (controller.signal.aborted) releaseThresholdPreview(result);
                else {
                    if (result instanceof Blob) throw new Error('Invalid threshold preview');
                    setFrame(result);
                    setError(false);
                }
            } catch {
                if (!controller.signal.aborted) setError(true);
            } finally {
                running = false;
                void dispatch();
            }
        }
        update.current = (next) => {
            queued = next;
            void dispatch();
        };
        return () => {
            controller.abort();
            update.current = null;
        };
    }, [source, render]);

    useEffect(() => {
        update.current?.(bands);
    }, [source, render, bands]);

    useEffect(() => () => releaseThresholdPreview(frame), [frame]);
    return { frame, error };
}
