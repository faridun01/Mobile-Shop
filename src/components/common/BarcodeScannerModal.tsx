import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Scan, QrCode, Smartphone, ArrowRight } from 'lucide-react';

export const BarcodeScannerModal: React.FC = () => {
  const { isScannerOpen, scannerCallback, closeScanner, devices, currentUser } = useApp();
  const [manualCode, setManualCode] = useState('');
  const [activeTab, setActiveTab] = useState<'camera' | 'quick'>('camera');

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

  // Filter available devices for quick tap test
  const availableDevices = devices.filter(d => {
    if (currentUser?.role === 'SELLER' && currentUser.storeId) {
      return d.locationId === currentUser.storeId;
    }
    return true;
  }).slice(0, 8);

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

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-[#0B0E14]/70 text-xs font-mono">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2 text-center transition-colors ${
              activeTab === 'camera'
                ? 'text-emerald-400 border-b-2 border-emerald-500 bg-[#0F1219] font-bold'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            LASER / CAMERA
          </button>
          <button
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-2 text-center transition-colors ${
              activeTab === 'quick'
                ? 'text-emerald-400 border-b-2 border-emerald-500 bg-[#0F1219] font-bold'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            STOCK SAMPLES ({availableDevices.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'camera' ? (
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
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-mono text-slate-400 mb-2">
                Click any device to simulate instant laser barcode capture:
              </p>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded bg-[#0B0E14]">
                {availableDevices.map((dev) => (
                  <button
                    key={dev.id}
                    onClick={() => handleScanCode(dev.imei)}
                    className="w-full text-left p-2.5 hover:bg-slate-900 flex items-center justify-between group transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                        <p className="text-xs font-semibold text-slate-200 truncate">{dev.brand} {dev.model}</p>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono pl-5">
                        IMEI: {dev.imei} • {dev.color}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400 group-hover:bg-emerald-500/15">
                      SCAN
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
