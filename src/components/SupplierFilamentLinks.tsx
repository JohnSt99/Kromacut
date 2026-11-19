import { invoke, isTauri } from '@tauri-apps/api/core';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupplierSet } from '../data/supplierFilaments';

export function SupplierFilamentLinks({ supplier }: { supplier: SupplierSet }) {
    const { t } = useTranslation('workspace');
    const [openFailed, setOpenFailed] = useState(false);

    async function openManufacturer(event: MouseEvent<HTMLAnchorElement>, url: string) {
        if (!isTauri()) return;
        event.preventDefault();
        setOpenFailed(false);
        try {
            await invoke('open_supplier_page', { url });
        } catch {
            setOpenFailed(true);
        }
    }

    return (
        <details className="group rounded-md border border-border/50">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <ChevronRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 group-open:rotate-90"
                />
                {t('controlsPanel.filamentColors')}
            </summary>
            <ul className="max-h-48 space-y-0.5 overflow-y-auto px-2 pb-2">
                {supplier.filaments.map((filament) => {
                    const url = filament.manufacturerUrl ?? supplier.manufacturerUrl;
                    return (
                        <li key={filament.id}>
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => void openManufacturer(event, url)}
                                className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs text-primary underline underline-offset-2 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <span
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5 shrink-0 rounded-sm border border-border"
                                    style={{ backgroundColor: filament.hex }}
                                />
                                <span className="min-w-0 flex-1">{filament.name}</span>
                                <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
                            </a>
                        </li>
                    );
                })}
            </ul>
            {openFailed && (
                <p role="alert" className="px-2.5 pb-2 text-xs text-destructive">
                    {t('controlsPanel.openManufacturerFailed')}
                </p>
            )}
        </details>
    );
}
