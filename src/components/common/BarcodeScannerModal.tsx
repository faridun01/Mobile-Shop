import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Scan, QrCode, ArrowRight } from 'lucide-react';

export const BarcodeScannerModal: React.FC = () => {
  const { isScannerOpen, scannerCallback, closeScanner } = useApp();
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (isScannerOpen) {
      setManualCode('');
    }
  }, [isScannerOpen]);

  if (!isScannerOpen) return null;

  const handleScanCode = (code: string) => {
    if (!code.trim()) return;
    if (scannerCallback) {
      scannerCallback(code.trim());
    }
    closeScanner();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-lg bg-[#0F1219] border border-slate-800 text-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B0E14]">
          <div className="flex items-center space-x-2">
            <Scan className="w-4 h-4 text-emerald-400" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">OPTICAL / LASER IMEI SCANNER</h3>
          </div>
          <button
            onClick={closeScanner}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-4">
            {/* Visual camera reticle */}
            <div className="relative aspect-4/3 rounded-lg bg-[#0B0E14] border border-slate-800 overflow-hidden flex items-center justify-center">
              <div className="absolute inset-x-8 top-1/2 h-0.5 bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse" />
              <div className="w-48 h-32 border-2 border-dashed border-emerald-500/50 rounded flex flex-col items-center justify-center p-2 text-center">
                <QrCode className="w-8 h-8 text-emerald-400/80 mb-1" />
                <p className="text-[11px] font-mono text-slate-400">AIM AT BARCODE OR 15-DIGIT IMEI</p>
              </div>
              <div className="absolute bottom-2 inset-x-0 text-center">
                <span className="text-[9px] font-mono bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800 uppercase tracking-widest">
                  HARDWARE 2D SCANNER READY
                </span>
              </div>
            </div>

            {/* Manual code input */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                OR ENTER IMEI / CODE MANUALLY:
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={manualCode ?? ''}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScanCode(manualCode)}
                  placeholder="e.g. 354891100234561"
                  autoFocus
                  className="flex-1 rounded bg-[#0B0E14] border border-slate-800 px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  onClick={() => handleScanCode(manualCode)}
                  disabled={!manualCode.trim()}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-xs font-mono font-bold text-white flex items-center space-x-1 uppercase"
                >
                  <span>OK</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0B0E14] border-t border-slate-800 flex justify-end">
          <button
            onClick={closeScanner}
            className="px-3 py-1 rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
