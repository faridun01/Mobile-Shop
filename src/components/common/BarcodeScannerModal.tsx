import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Scan, QrCode, ArrowRight, Camera, SwitchCamera, RefreshCw, AlertCircle, Volume2, CheckCircle2 } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from 'html5-qrcode';

export const BarcodeScannerModal: React.FC = () => {
  const { isScannerOpen, scannerCallback, closeScanner } = useApp();
  const [manualCode, setManualCode] = useState('');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const isStoppingRef = useRef<boolean>(false);

  // Web Audio API beep sound for instant feedback
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime); // 1.2 kHz crisp beep
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  };

  const handleScanCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    playBeep();
    setLastScannedCode(trimmed);
    
    if (scannerCallback) {
      scannerCallback(trimmed);
    }
    stopAndClose();
  };

  const stopAndClose = async () => {
    await stopCamera();
    closeScanner();
  };

  const stopCamera = async () => {
    if (html5QrcodeRef.current && !isStoppingRef.current) {
      isStoppingRef.current = true;
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (err) {
        console.warn("Error stopping scanner:", err);
      } finally {
        html5QrcodeRef.current = null;
        isStoppingRef.current = false;
        setIsScanning(false);
      }
    }
  };

  useEffect(() => {
    if (!isScannerOpen) {
      stopCamera();
      return;
    }

    setManualCode('');
    setLastScannedCode(null);
    setCameraError(null);

    let isMounted = true;

    const startScanner = async () => {
      try {
        await stopCamera();
        if (!isMounted) return;

        // Try getting cameras list
        let devices: CameraDevice[] = [];
        try {
          devices = await Html5Qrcode.getCameras();
          if (isMounted && devices && devices.length > 0) {
            setCameras(devices);
          }
        } catch (e) {
          console.warn("Could not enumerate cameras, will use default camera:", e);
        }

        const containerId = "realtime-barcode-scanner-video";
        const containerElem = document.getElementById(containerId);
        if (!containerElem) return;

        const scannerInstance = new Html5Qrcode(containerId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODABAR,
          ]
        });

        html5QrcodeRef.current = scannerInstance;

        // Determine target camera device or facing mode
        let cameraConfig: string | { facingMode: string } = { facingMode: "environment" };
        if (selectedCameraId) {
          cameraConfig = selectedCameraId;
        } else if (devices.length > 0) {
          const rearCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('environment') ||
            d.label.toLowerCase().includes('0')
          );
          const chosen = rearCam ? rearCam.id : devices[0].id;
          cameraConfig = chosen;
          setSelectedCameraId(chosen);
        }

        const scanConfig = {
          fps: 20,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.floor(Math.min(viewfinderWidth * 0.85, 340));
            const height = Math.floor(Math.min(viewfinderHeight * 0.55, 170));
            return { width: Math.max(width, 200), height: Math.max(height, 100) };
          },
          aspectRatio: 1.333333,
        };

        await scannerInstance.start(
          cameraConfig,
          scanConfig,
          (decodedText) => {
            if (!isMounted) return;
            handleScanCode(decodedText);
          },
          () => {
            // Per-frame no code found - normal operation
          }
        );

        if (isMounted) {
          setIsScanning(true);
          setCameraError(null);
        }
      } catch (err: any) {
        console.error("Camera scanner error:", err);
        if (isMounted) {
          setIsScanning(false);
          setCameraError(
            err?.message || 
            "Камера недоступна или доступ заблокирован в настройках браузера. Вы можете ввести штрихкод или IMEI вручную ниже."
          );
        }
      }
    };

    // Small delay to ensure DOM modal element is rendered
    const timer = setTimeout(() => {
      startScanner();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopCamera();
    };
  }, [isScannerOpen, selectedCameraId]);

  if (!isScannerOpen) return null;

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCamId = e.target.value;
    setSelectedCameraId(newCamId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-lg bg-[#0F1219] border border-slate-800 text-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B0E14]">
          <div className="flex items-center space-x-2">
            <Scan className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
              СКАНИРОВАНИЕ В РЕАЛЬНОМ ВРЕМЕНИ
            </h3>
          </div>
          <button
            onClick={stopAndClose}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Scanner Viewfinder Box */}
          <div className="relative aspect-4/3 rounded-lg bg-[#0B0E14] border border-slate-800 overflow-hidden flex items-center justify-center">
            {/* HTML5 QR Code Video Target */}
            <div 
              id="realtime-barcode-scanner-video" 
              className="w-full h-full object-cover rounded overflow-hidden [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
            />

            {/* Scanning Laser Beam Overlay */}
            {isScanning && !lastScannedCode && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="absolute inset-x-6 top-1/2 h-0.5 bg-emerald-500 shadow-[0_0_15px_#10b981] animate-pulse" />
                <div className="w-[85%] h-[55%] border-2 border-dashed border-emerald-500/60 rounded flex flex-col items-center justify-between p-2">
                  <div className="w-full flex justify-between">
                    <span className="w-3 h-3 border-t-2 border-l-2 border-emerald-400" />
                    <span className="w-3 h-3 border-t-2 border-r-2 border-emerald-400" />
                  </div>
                  <div className="w-full flex justify-between">
                    <span className="w-3 h-3 border-b-2 border-l-2 border-emerald-400" />
                    <span className="w-3 h-3 border-b-2 border-r-2 border-emerald-400" />
                  </div>
                </div>
              </div>
            )}

            {/* Success Overlay */}
            {lastScannedCode && (
              <div className="absolute inset-0 bg-emerald-950/90 flex flex-col items-center justify-center p-4 text-center backdrop-blur-xs animate-in fade-in">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2 animate-bounce" />
                <span className="text-xs font-mono text-emerald-200 uppercase tracking-widest mb-1">ОТСКАНИРОВАНО!</span>
                <span className="text-sm font-mono font-bold text-white bg-emerald-900/60 px-3 py-1 rounded border border-emerald-500/50">
                  {lastScannedCode}
                </span>
              </div>
            )}

            {/* Camera Error Message */}
            {cameraError && (
              <div className="absolute inset-0 bg-[#0B0E14] p-4 flex flex-col items-center justify-center text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-amber-400/90" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-300">Камера недоступна</p>
                  <p className="text-[11px] text-slate-400 max-w-xs">{cameraError}</p>
                </div>
                <button
                  onClick={() => {
                    setCameraError(null);
                    setSelectedCameraId(selectedCameraId);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-mono rounded flex items-center space-x-1.5 border border-slate-700 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>ПОВТОРИТЬ</span>
                </button>
              </div>
            )}

            {/* Live Camera Badge */}
            {isScanning && !lastScannedCode && (
              <div className="absolute top-2 left-2 z-10 flex items-center space-x-1.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest">LIVE CAMERA</span>
              </div>
            )}
          </div>

          {/* Camera Selection Dropdown if multiple cameras exist */}
          {cameras.length > 1 && (
            <div className="flex items-center space-x-2 bg-[#0B0E14] p-2 rounded border border-slate-800">
              <Camera className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedCameraId}
                onChange={handleCameraChange}
                className="flex-1 bg-transparent text-xs font-mono text-slate-200 focus:outline-none cursor-pointer"
              >
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id} className="bg-slate-900 text-slate-200">
                    {cam.label || `Камера ${cam.id.slice(0, 5)}...`}
                  </option>
                ))}
              </select>
              <SwitchCamera className="w-3.5 h-3.5 text-slate-400" />
            </div>
          )}

          {/* Manual input */}
          <div className="space-y-1">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">
              ИЛИ ВВЕДИТЕ IMEI / ШТРИХКОД ВРУЧНУЮ:
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={manualCode ?? ''}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScanCode(manualCode)}
                placeholder="Например: 354891100234561"
                autoFocus
                className="flex-1 rounded bg-[#0B0E14] border border-slate-800 px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
              />
              <button
                onClick={() => handleScanCode(manualCode)}
                disabled={!manualCode.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-xs font-mono font-bold text-white flex items-center space-x-1 uppercase transition-colors"
              >
                <span>ВВОД</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0B0E14] border-t border-slate-800 flex justify-between items-center text-[10px] font-mono text-slate-500">
          <span>ПОДДЕРЖКА: EAN-13, CODE-128, QR, IMEI</span>
          <button
            onClick={stopAndClose}
            className="px-3 py-1 rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            ЗАКРЫТЬ
          </button>
        </div>
      </div>
    </div>
  );
};
