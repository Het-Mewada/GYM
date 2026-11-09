'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  importMembersCsv,
  fetchImportJobs,
  type CsvImportJob,
  type CsvImportResponse
} from '../lib/api';
import { parseCsv, normalizeCsvHeader, validateCsvRow, type PiiFreeCsvError } from '@gym/shared';
import { useToast } from './Toast';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  gymId: string;
  onImportSuccess: () => void;
}

export function CsvImportModal({ isOpen, onClose, gymId, onImportSuccess }: CsvImportModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewRows, setPreviewRows] = useState<Array<{ rowNum: number; data: Record<string, string>; valid: boolean; errors?: PiiFreeCsvError[] }>>([]);
  const [previewTotalCount, setPreviewTotalCount] = useState<number>(0);
  const [importResult, setImportResult] = useState<CsvImportResponse | null>(null);

  // History state
  const [historyJobs, setHistoryJobs] = useState<CsvImportJob[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [inspectedJob, setInspectedJob] = useState<CsvImportJob | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setPreviewRows([]);
      setPreviewTotalCount(0);
      setImportResult(null);
      setInspectedJob(null);
      setActiveTab('upload');
    }
  }, [isOpen]);

  // Load history when history tab is clicked
  useEffect(() => {
    if (isOpen && activeTab === 'history' && gymId) {
      loadHistory();
    }
  }, [isOpen, activeTab, gymId]);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetchImportJobs(gymId);
      setHistoryJobs(res.jobs || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load import history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const downloadSampleTemplate = () => {
    const csvContent = [
      'First Name,Last Name,Phone,Email,Gender,Date of Birth,Emergency Contact Name,Emergency Contact Phone',
      'Aarav,Sharma,9876543210,aarav@example.com,male,1995-04-12,Rajesh Sharma,9876543211',
      'Priya,Patel,9876543212,priya@example.com,female,1998-11-23,,',
      'Rohan,,9876543213,,other,2001-01-30,,'
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'members_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Sample CSV template downloaded.');
  };

  const handleFileChange = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Please upload a valid .csv file.');
      return;
    }

    setSelectedFile(file);
    setImportResult(null);

    // Read and pre-validate client side
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const parsed = parseCsv(text);
        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          toast.error('The selected CSV file is empty.');
          return;
        }

        const normalizedHeaders = parsed.headers.map(normalizeCsvHeader);
        setPreviewTotalCount(parsed.rows.length);

        const previews = parsed.rows.slice(0, 5).map((row, idx) => {
          const rowNum = idx + 2;
          const rowObj: Record<string, string> = {};
          normalizedHeaders.forEach((h, hIdx) => {
            rowObj[h] = row[hIdx] || '';
          });
          const validation = validateCsvRow(rowObj, rowNum);
          return {
            rowNum,
            data: rowObj,
            valid: validation.valid,
            errors: validation.valid ? undefined : validation.errors
          };
        });

        setPreviewRows(previews);
      } catch (err: unknown) {
        toast.error('Failed to parse CSV preview.');
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !gymId) return;

    setIsSubmitting(true);
    try {
      const res = await importMembersCsv(gymId, selectedFile);
      setImportResult(res);
      toast.success(
        `Batch completed: ${res.importedCount} members imported (${res.errorCount} skipped).`
      );
      onImportSuccess();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'CSV import failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Import Members via CSV</h2>
              <p className="text-xs text-neutral-400">
                Bulk upload member directories with automatic phone normalization and validation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-neutral-800 bg-neutral-950/40">
          <button
            type="button"
            onClick={() => {
              setActiveTab('upload');
              setInspectedJob(null);
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 cursor-pointer ${
              activeTab === 'upload'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Upload CSV
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 cursor-pointer ${
              activeTab === 'history'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Import History
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'upload' ? (
            <>
              {!importResult ? (
                <>
                  {/* Dropzone & Template Bar */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-400">
                      Standard columns: First Name, Last Name, Phone, Email, Gender, Date of Birth
                    </span>
                    <button
                      type="button"
                      onClick={downloadSampleTemplate}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download Sample Template
                    </button>
                  </div>

                  {/* Dropzone Container */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                      isDragging
                        ? 'border-emerald-500 bg-emerald-500/5'
                        : selectedFile
                        ? 'border-neutral-700 bg-neutral-950/60'
                        : 'border-neutral-800 hover:border-neutral-700 bg-neutral-950/30'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFileChange(e.target.files[0]);
                        }
                      }}
                    />

                    <div className="w-12 h-12 rounded-xl bg-neutral-800/80 mx-auto flex items-center justify-center text-neutral-400 mb-3">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>

                    {selectedFile ? (
                      <div>
                        <p className="text-sm font-semibold text-emerald-400">{selectedFile.name}</p>
                        <p className="text-xs text-neutral-400 mt-1">
                          {(selectedFile.size / 1024).toFixed(1)} KB • {previewTotalCount} rows ready for import
                        </p>
                        <p className="text-[11px] text-neutral-500 mt-2">Click to replace file</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-neutral-200">
                          Click to select a CSV file or drag and drop here
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">Accepts standard .csv files up to 10 MB</p>
                      </div>
                    )}
                  </div>

                  {/* Pre-validation Preview Table */}
                  {previewRows.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>Previewing first {previewRows.length} of {previewTotalCount} rows</span>
                        <span className="font-mono text-[11px] text-neutral-500">Row numbers match CSV lines</span>
                      </div>

                      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/60">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-neutral-900/80 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider font-semibold">
                              <tr>
                                <th className="py-2.5 px-3">Row</th>
                                <th className="py-2.5 px-3">Name</th>
                                <th className="py-2.5 px-3">Phone</th>
                                <th className="py-2.5 px-3">Email</th>
                                <th className="py-2.5 px-3">Gender</th>
                                <th className="py-2.5 px-3 text-right">Pre-Check</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                              {previewRows.map((r) => (
                                <tr key={r.rowNum} className="hover:bg-neutral-900/40">
                                  <td className="py-2 px-3 font-mono text-neutral-500">#{r.rowNum}</td>
                                  <td className="py-2 px-3 font-medium text-neutral-200">
                                    {r.data.firstName || '—'} {r.data.lastName || ''}
                                  </td>
                                  <td className="py-2 px-3 font-mono">{r.data.phone || '—'}</td>
                                  <td className="py-2 px-3 text-neutral-400">{r.data.email || '—'}</td>
                                  <td className="py-2 px-3 capitalize">{r.data.gender || 'unspecified'}</td>
                                  <td className="py-2 px-3 text-right">
                                    {r.valid ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        Valid
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20" title={r.errors?.map((e) => e.message).join(', ')}>
                                        Check Error
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Import Completed Summary View */
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Import Batch Processed</h3>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        File: <span className="font-mono text-neutral-300">{importResult.job.fileName}</span>
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                        importResult.importedCount > 0
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}
                    >
                      {importResult.job.status}
                    </span>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 text-center">
                      <div className="text-xs text-neutral-400 uppercase font-semibold">Total Rows</div>
                      <div className="text-xl font-bold text-white mt-1">{importResult.totalRows}</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-center">
                      <div className="text-xs text-emerald-400 uppercase font-semibold">Imported</div>
                      <div className="text-xl font-bold text-emerald-400 mt-1">{importResult.importedCount}</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-center">
                      <div className="text-xs text-red-400 uppercase font-semibold">Skipped / Errors</div>
                      <div className="text-xl font-bold text-red-400 mt-1">{importResult.errorCount}</div>
                    </div>
                  </div>

                  {/* Errors Breakdown (PII-free) */}
                  {importResult.errorCount > 0 && importResult.job.errorsJson && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        Row-by-Row Error Log ({importResult.errorCount})
                      </h4>
                      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/60 max-h-56 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 uppercase font-semibold sticky top-0">
                            <tr>
                              <th className="py-2 px-3">Row</th>
                              <th className="py-2 px-3">Field</th>
                              <th className="py-2 px-3">Code</th>
                              <th className="py-2 px-3">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800 text-neutral-300">
                            {importResult.job.errorsJson.map((err, i) => (
                              <tr key={i} className="hover:bg-neutral-900/40">
                                <td className="py-2 px-3 font-mono text-neutral-400">#{err.row}</td>
                                <td className="py-2 px-3 font-medium text-amber-300">{err.field}</td>
                                <td className="py-2 px-3 font-mono text-[11px] text-neutral-400">{err.code}</td>
                                <td className="py-2 px-3 text-red-300">{err.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* History Tab */
            <div className="space-y-3">
              {inspectedJob ? (
                /* Inspect Specific Past Job */
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setInspectedJob(null)}
                    className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition cursor-pointer"
                  >
                    ← Back to all import jobs
                  </button>

                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white">{inspectedJob.fileName}</h3>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          Date: {new Date(inspectedJob.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase bg-neutral-800 text-neutral-300 border border-neutral-700">
                        {inspectedJob.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-neutral-800/80 text-center">
                      <div>
                        <div className="text-[10px] text-neutral-500 uppercase">Total</div>
                        <div className="text-sm font-bold text-white">{inspectedJob.totalRows}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-500 uppercase">Imported</div>
                        <div className="text-sm font-bold text-emerald-400">{inspectedJob.processedRows}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-red-500 uppercase">Errors</div>
                        <div className="text-sm font-bold text-red-400">{inspectedJob.errorCount}</div>
                      </div>
                    </div>
                  </div>

                  {inspectedJob.errorCount > 0 && inspectedJob.errorsJson && (
                    <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/60 max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 uppercase font-semibold sticky top-0">
                          <tr>
                            <th className="py-2 px-3">Row</th>
                            <th className="py-2 px-3">Field</th>
                            <th className="py-2 px-3">Code</th>
                            <th className="py-2 px-3">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800 text-neutral-300">
                          {inspectedJob.errorsJson.map((err, i) => (
                            <tr key={i}>
                              <td className="py-2 px-3 font-mono text-neutral-400">#{err.row}</td>
                              <td className="py-2 px-3 text-amber-300">{err.field}</td>
                              <td className="py-2 px-3 font-mono text-[11px] text-neutral-400">{err.code}</td>
                              <td className="py-2 px-3 text-red-300">{err.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                /* History List */
                <div>
                  {isLoadingHistory ? (
                    <p className="text-xs text-neutral-500 text-center py-8">Loading past import jobs...</p>
                  ) : historyJobs.length === 0 ? (
                    <div className="text-center py-10 border border-neutral-800/80 rounded-xl bg-neutral-950/30">
                      <p className="text-sm text-neutral-400 font-medium">No CSV import jobs on record</p>
                      <p className="text-xs text-neutral-600 mt-1">Upload a CSV file in the Upload tab to import members.</p>
                    </div>
                  ) : (
                    <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/60">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 uppercase font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">File Name</th>
                            <th className="py-2.5 px-3">Import Date</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">Imported / Total</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                          {historyJobs.map((job) => (
                            <tr key={job.id} className="hover:bg-neutral-900/40">
                              <td className="py-2.5 px-3 font-medium text-white">{job.fileName}</td>
                              <td className="py-2.5 px-3 text-neutral-400">
                                {new Date(job.createdAt).toLocaleDateString()}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                    job.status === 'completed'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}
                                >
                                  {job.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                <span className="text-emerald-400">{job.processedRows}</span> / {job.totalRows}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setInspectedJob(job)}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 border-t border-neutral-800 bg-neutral-950/40">
          {importResult ? (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewRows([]);
                  setPreviewTotalCount(0);
                  setImportResult(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition cursor-pointer"
              >
                Upload Another File
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 transition cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 w-full">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition cursor-pointer"
              >
                Cancel
              </button>
              {activeTab === 'upload' && (
                <button
                  type="button"
                  data-testid="start-csv-import-button"
                  disabled={!selectedFile || isSubmitting}
                  onClick={handleUploadSubmit}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-950/40"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${previewTotalCount > 0 ? previewTotalCount + ' ' : ''}Members`
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
