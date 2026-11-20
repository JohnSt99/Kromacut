import { expect, test, type Page, type Locator } from '@playwright/test';
import type { ImageEditRequest } from '../../src/types/imageEditing';

async function fixture(page: Page) {
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 30;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#303030';
        ctx.fillRect(0, 0, 24, 30);
        ctx.fillStyle = 'rgba(155, 155, 155, 0.5)';
        ctx.fillRect(24, 0, 24, 30);
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'two-values.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await expect(page.getByText('Image: 48×30', { exact: true })).toBeVisible();
}

const pixel = (canvas: Locator) =>
    canvas.evaluate((element: HTMLCanvasElement) => {
        const data = element
            .getContext('2d')!
            .getImageData(Math.floor(element.width * 0.75), element.height >> 1, 1, 1).data;
        return [...data];
    });

test('@smoke threshold handles preview, compare, apply at full resolution and undo with alpha', async ({
    page,
}) => {
    await fixture(page);
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Color thresholds' });
    const preview = dialog.getByTestId('threshold-preview');
    await expect(dialog.getByRole('spinbutton', { name: 'Number of colors' })).toHaveValue('2');
    await expect(dialog.getByTestId('threshold-marker')).toHaveCount(1);
    await dialog.getByLabel('Color 1', { exact: true }).fill('#000000');
    await dialog.getByLabel('Color 2', { exact: true }).fill('#ffffff');
    await dialog.getByLabel('Threshold 1 value', { exact: true }).fill('170');
    await expect.poll(async () => (await pixel(preview))[3]).toBeGreaterThan(100);
    const opacity = (await pixel(preview))[3];
    await expect.poll(() => pixel(preview)).toEqual([0, 0, 0, opacity]);
    expect(opacity).toBeGreaterThan(100);
    expect(opacity).toBeLessThan(150);
    await dialog.getByLabel('Threshold 1 value', { exact: true }).fill('100');
    await expect.poll(() => pixel(preview)).toEqual([255, 255, 255, opacity]);
    await dialog.getByRole('checkbox', { name: 'Show original' }).check();
    await expect.poll(async () => (await pixel(preview))[0]).toBeGreaterThan(140);
    expect((await pixel(preview))[0]).toBeLessThan(165);
    await dialog.getByRole('checkbox', { name: 'Show original' }).uncheck();
    await dialog.getByRole('button', { name: 'Apply thresholds', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const image = page.getByTestId('image-dropzone').locator('canvas').first();
    await expect.poll(() => pixel(image)).toEqual([255, 255, 255, opacity]);
    await expect(page.getByText('Image: 48×30', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await pixel(image))[0]).toBeLessThan(165);
    await expect.poll(async () => (await pixel(image))[3]).toBe(opacity);
});

test('@smoke cancelling full-resolution threshold Apply discards the pending job and image edit', async ({
    page,
}) => {
    await page.addInitScript(() => {
        const state = { applyId: -1, cancelled: false };
        (window as unknown as { thresholdJob: typeof state }).thresholdJob = state;
        const NativeWorker = Worker;
        window.Worker = class extends NativeWorker {
            constructor(url: URL | string, options?: WorkerOptions) {
                super(url, options);
                if (!String(url).includes('imageEditing.worker')) return;
                const post = this.postMessage.bind(this);
                this.postMessage = (
                    request: ImageEditRequest,
                    transfer?: Transferable[] | StructuredSerializeOptions
                ) => {
                    if (
                        request.kind === 'render' &&
                        request.output === 'png' &&
                        request.snapshot.thresholds
                    ) {
                        state.applyId = request.id;
                        request.snapshot.bitmap.close();
                        return;
                    }
                    if (request.kind === 'cancel' && request.id === state.applyId)
                        state.cancelled = true;
                    if (Array.isArray(transfer)) post(request, transfer);
                    else post(request, transfer);
                };
            }
        };
    });
    await fixture(page);
    const canvas = page.getByTestId('image-dropzone').locator('canvas').first();
    const before = await pixel(canvas);
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Color thresholds' });
    await dialog.getByRole('button', { name: 'Apply thresholds', exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    (window as unknown as { thresholdJob: { applyId: number } }).thresholdJob
                        .applyId
            )
        )
        .toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { thresholdJob: { cancelled: boolean } }).thresholdJob
                    .cancelled
        )
    ).toBe(true);
    expect(await pixel(canvas)).toEqual(before);
});
