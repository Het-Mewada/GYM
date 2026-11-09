'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface TenantQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  gymId: string;
  gymName: string;
  gymSlug?: string;
}

export function TenantQrModal({ isOpen, onClose, gymId, gymName, gymSlug }: TenantQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [registrationUrl, setRegistrationUrl] = useState('');

  const targetIdentifier = gymSlug || gymId;

  useEffect(() => {
    if (!isOpen) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/join/${encodeURIComponent(targetIdentifier)}`;
    setRegistrationUrl(url);

    QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: {
        dark: '#050505',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });
  }, [isOpen, targetIdentifier]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    if (!registrationUrl) return;
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${gymSlug || 'gym'}-registration-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${gymName} - Member Registration QR</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              margin: 0;
              text-align: center;
              color: #111;
            }
            .badge {
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #10b981;
              font-weight: 700;
              margin-bottom: 8px;
            }
            h1 {
              font-size: 32px;
              margin: 0 0 8px 0;
            }
            p {
              font-size: 16px;
              color: #666;
              margin: 0 0 24px 0;
            }
            .qr-wrapper {
              padding: 24px;
              background: #fff;
              border: 3px solid #111;
              border-radius: 16px;
              display: inline-block;
              box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            }
            img {
              display: block;
              width: 280px;
              height: 280px;
            }
            .instructions {
              margin-top: 24px;
              font-size: 18px;
              font-weight: 600;
              color: #111;
            }
            .url {
              margin-top: 8px;
              font-size: 12px;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="badge">GymOS Member Portal</div>
          <h1>${gymName}</h1>
          <p>Scan the QR code with your mobile camera to register as a new member</p>
          <div class="qr-wrapper">
            <img src="${qrDataUrl}" alt="Registration QR Code" />
          </div>
          <div class="instructions">Scan to Fill Member Registration Form</div>
          <div class="url">${registrationUrl}</div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Front Desk QR Registration
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">{gymName}</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Prospective members can scan this QR code with their mobile phone to self-register.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center my-4 p-5 rounded-xl bg-white border border-neutral-200 shadow-inner">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for ${gymName}`}
              className="w-56 h-56 object-contain"
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-neutral-400 text-sm">
              Generating QR Code...
            </div>
          )}
          <span className="text-[11px] font-mono font-medium text-neutral-600 mt-2">
            Scan with any camera app
          </span>
        </div>

        {/* Registration URL Copy Box */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-neutral-400 mb-1.5">
            Direct Registration Link
          </label>
          <div className="flex items-center gap-2 rounded-lg bg-neutral-950 border border-neutral-800 p-2 text-xs">
            <span className="flex-1 truncate text-neutral-300 font-mono select-all">
              {registrationUrl}
            </span>
            <button
              onClick={handleCopyLink}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-white'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition border border-neutral-700 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PNG
          </button>
          <button
            onClick={handlePrint}
            disabled={!qrDataUrl}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-lg shadow-emerald-900/30 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Poster
          </button>
        </div>
      </div>
    </div>
  );
}
