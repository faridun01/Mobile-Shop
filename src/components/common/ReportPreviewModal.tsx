import React from 'react';
import { Download } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { ReportTable } from '../../utils/exportReports';

interface ReportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  table: ReportTable | null;
  onDownload: () => void;
}

/**
 * Shows the exact rows a report export will contain, scoped to the page's current
 * period/store filters, so the user can check the numbers on screen before the
 * CSV hits disk instead of having to open the downloaded file to find out.
 */
export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({ open, onClose, title, subtitle, table, onDownload }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidth="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Закрыть</Button>
          <Button variant="primary" fullWidth leftIcon={Download} onClick={onDownload} disabled={!table || table.rows.length === 0}>
            Скачать CSV
          </Button>
        </>
      }
    >
      {!table || table.rows.length === 0 ? (
        <p className="text-xs text-fg-subtle text-center py-8">Нет данных за выбранный период / магазин</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-border text-[10px] text-fg-subtle uppercase sticky top-0 bg-surface">
                {table.headers.map((h, i) => (
                  <th key={i} className="py-2 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {table.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-surface-raised transition-colors">
                  {row.map((cell, ci) => (
                    <td key={ci} className="py-2 px-3 text-fg-muted">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold text-fg-muted">
                {table.totalsRow.map((cell, ci) => (
                  <td key={ci} className="py-2 px-3">{cell}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Dialog>
  );
};
