import { expect, test } from '@playwright/test';
import { fakeDesktopBeforeLoad, type FakeDesktopWindow } from './helpers/fakeDesktop';

/**
 * Focused UI coverage for advanced palette management (issue #26):
 * supplier palette group + disclaimer, clone wiring, per-color
 * enable/disable, and the palette-driven color count.
 */

test('@smoke supplier palettes, clone, and color toggles work end to end', async ({ page }) => {
    await page.goto('/app');

    const paletteTrigger = page.locator('#palette-select');
    await expect(paletteTrigger).toBeVisible();

    // Supplier group, non-affiliation caption, and the Bambu palette (30 colors)
    await paletteTrigger.click();
    await expect(page.getByText('Supplier Palettes', { exact: true })).toBeVisible();
    await expect(
        page.getByText(/not affiliated with, endorsed by, or sponsored by/i).first()
    ).toBeVisible();
    const bambuOption = page.getByRole('option', { name: /Bambu Lab PLA Basic \(30\)/ });
    await expect(bambuOption).toBeVisible();

    // Selecting it drives the color count, which becomes palette-determined
    await bambuOption.click();
    const finalColors = page.locator('#final-colors');
    await expect(finalColors).toHaveValue('30');
    await expect(finalColors).toBeDisabled();

    // Clone into an editable custom palette (auto-selected, feedback shown)
    await page.getByRole('button', { name: /clone selected palette/i }).click();
    await expect(page.getByText(/^Cloned as/)).toBeVisible();
    await expect(paletteTrigger).toContainText('Bambu Lab PLA Basic (copy)');

    // Disable one color in the editor; supplier names came along with the clone
    await page.getByRole('button', { name: 'Edit selected palette' }).click();
    await expect(page.getByPlaceholder('Name (optional)').first()).toHaveValue('Jade White');
    await page.getByRole('button', { name: 'Disable color 1', exact: true }).click();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // The dropdown now reports enabled/total and the count input follows
    await expect(finalColors).toHaveValue('29');
    await paletteTrigger.click();
    await expect(
        page.getByRole('option', { name: /Bambu Lab PLA Basic \(copy\) \(29\/30\)/ })
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Toggle state survives a reload (persisted to localStorage)
    await page.reload();
    await expect(page.locator('#final-colors')).toHaveValue('29');
});

const prusamentShade = 'https://www.prusa3d.com/product/prusament-pla-pistachio-green-1kg';
const sunluLine = 'https://www.sunlu.com/products/pla-classic-filament';

test('@smoke a supplier shade opens its manufacturer page without changing the palette', async ({
    page,
    context,
}) => {
    await context.route(prusamentShade, async (route) => {
        await route.fulfill({ contentType: 'text/plain', body: 'Manufacturer product listing' });
    });
    await page.goto('/app');
    const select = page.locator('#palette-select');
    const reveal = page.getByText('Filament colors', { exact: true });
    await expect(reveal).toHaveCount(0);

    await select.click();
    await page.getByRole('option', { name: /Prusament PLA \(20\)/ }).click();
    await reveal.click();
    const shade = page.getByRole('link', { name: 'Pistachio Green', exact: true });
    await expect(shade).toHaveAttribute('href', prusamentShade);
    const popupReady = page.waitForEvent('popup');
    await shade.press('Enter');
    const popup = await popupReady;
    await expect(popup).toHaveURL(prusamentShade);
    await popup.close();
    await expect(select).toContainText('Prusament PLA');
    await expect(page.locator('#final-colors')).toHaveValue('20');

    await select.click();
    await page.getByRole('option', { name: /SUNLU PLA Classic \(15\)/ }).click();
    await reveal.click();
    await expect(page.getByRole('link', { name: 'Chocolate', exact: true })).toHaveAttribute(
        'href',
        sunluLine
    );
    await expect(shade).toHaveCount(0);
});

test('@smoke desktop hands the supplier link to the browser and can retry a failed launch', async ({
    page,
}) => {
    type TestWindow = FakeDesktopWindow & { supplierPageRequests: string[] };
    await fakeDesktopBeforeLoad(page, (desktop) => {
        const host = window as unknown as TestWindow;
        host.supplierPageRequests = [];
        desktop.handle('open_supplier_page', ({ url }: { url: string }) => {
            host.supplierPageRequests.push(url);
            if (host.supplierPageRequests.length === 1) throw new Error('Browser unavailable');
        });
    });
    await page.goto('/app');
    const select = page.locator('#palette-select');
    await select.click();
    await page.getByRole('option', { name: /SUNLU PLA Classic \(15\)/ }).click();
    await page.getByText('Filament colors', { exact: true }).click();

    const chocolate = page.getByRole('link', { name: 'Chocolate', exact: true });
    const error = page
        .getByRole('alert')
        .filter({ hasText: 'Could not open the manufacturer page.' });
    await chocolate.click();
    await expect(error).toBeVisible();
    await chocolate.click();
    await expect(error).toHaveCount(0);
    await expect
        .poll(() => page.evaluate(() => (window as unknown as TestWindow).supplierPageRequests))
        .toEqual([sunluLine, sunluLine]);
    await expect(page).toHaveURL(/\/app\/?$/);
    await expect(select).toContainText('SUNLU PLA Classic');
});
