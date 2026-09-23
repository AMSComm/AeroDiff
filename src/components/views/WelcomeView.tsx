import React, { useState } from 'react';
import {
  FolderTree,
  FileText,
  Table,
  Zap,
  ArrowRight,
  FolderOpen,
  FileCode,
  FileSpreadsheet,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { pickPath } from '../../utils/filePicker';

export const WelcomeView: React.FC = () => {
  const { openFileCompareTab, openFolderCompareTab, openCsvCompareTab, updateActiveTab } =
    useTabStore();

  const [compareKind, setCompareKind] = useState<'file' | 'folder' | 'csv' | 'text'>('folder');
  const [leftInput, setLeftInput] = useState('');
  const [rightInput, setRightInput] = useState('');

  const handlePickLeft = async (type: 'file' | 'folder') => {
    const path = await pickPath(type);
    if (path) {
      setLeftInput(path);
      if (type === 'folder') setCompareKind('folder');
      else setCompareKind('file');
    }
  };

  const handlePickRight = async (type: 'file' | 'folder') => {
    const path = await pickPath(type);
    if (path) {
      setRightInput(path);
      if (type === 'folder') setCompareKind('folder');
      else setCompareKind('file');
    }
  };

  const handleStartComparison = async () => {
    if (!leftInput.trim() || !rightInput.trim()) {
      alert('Vui lòng chọn hoặc nhập đường dẫn cho cả Bên Trái và Bên Phải');
      return;
    }

    const lPath = leftInput.trim();
    const rPath = rightInput.trim();

    if (compareKind === 'folder') {
      await openFolderCompareTab(lPath, rPath);
    } else if (compareKind === 'csv') {
      await openCsvCompareTab(lPath, rPath);
    } else {
      await openFileCompareTab(lPath, rPath);
    }
  };

  const handleOpenQuickText = () => {
    updateActiveTab({
      type: 'file',
      title: 'So sánh Text',
      leftContent: '// Dán nội dung bên trái vào đây\n',
      rightContent: '// Dán nội dung bên phải vào đây\n',
      isEditing: true,
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-neutral-950 text-neutral-100 overflow-y-auto select-none">
      <div className="w-full max-w-2xl bg-neutral-900/80 border border-neutral-800 rounded-xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center space-x-2 text-emerald-400 font-bold text-lg tracking-tight">
            <Zap className="w-5 h-5 fill-emerald-400/20" />
            <span>AeroDiff</span>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-normal">
              v0.1
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            Công cụ so sánh File, Thư mục và CSV siêu tốc, đa nền tảng, hỗ trợ chỉnh sửa trực tiếp.
          </p>
        </div>

        {/* 4 Mode Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <button
            onClick={() => setCompareKind('folder')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all text-xs ${
              compareKind === 'folder'
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 shadow-sm'
                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
            }`}
          >
            <FolderTree className="w-5 h-5 mb-1.5 text-amber-400" />
            <span className="font-medium">So sánh Thư mục</span>
            <span className="text-[10px] text-neutral-500 mt-0.5">Quét 2 thư mục</span>
          </button>

          <button
            onClick={() => setCompareKind('file')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all text-xs ${
              compareKind === 'file'
                ? 'bg-sky-500/15 border-sky-500/50 text-sky-200 shadow-sm'
                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
            }`}
          >
            <FileText className="w-5 h-5 mb-1.5 text-sky-400" />
            <span className="font-medium">So sánh File</span>
            <span className="text-[10px] text-neutral-500 mt-0.5">So khớp nội dung & edit</span>
          </button>

          <button
            onClick={() => setCompareKind('csv')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all text-xs ${
              compareKind === 'csv'
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200 shadow-sm'
                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
            }`}
          >
            <Table className="w-5 h-5 mb-1.5 text-emerald-400" />
            <span className="font-medium">So sánh CSV</span>
            <span className="text-[10px] text-neutral-500 mt-0.5">Bảng & Cột khóa</span>
          </button>

          <button
            onClick={handleOpenQuickText}
            className="flex flex-col items-center justify-center p-3 rounded-lg border bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700 transition-all text-xs"
          >
            <FileCode className="w-5 h-5 mb-1.5 text-neutral-300" />
            <span className="font-medium">So sánh Text</span>
            <span className="text-[10px] text-neutral-500 mt-0.5">Paste text trực tiếp</span>
          </button>
        </div>

        {/* Target Selectors: Left vs Right */}
        <div className="space-y-4 pt-2">
          {/* Left Picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-neutral-300">Bên Trái (Left Target):</label>
              <div className="flex space-x-1.5">
                <button
                  onClick={() => handlePickLeft('file')}
                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] flex items-center space-x-1"
                >
                  <FileCode className="w-3 h-3 text-sky-400" />
                  <span>Chọn File</span>
                </button>
                <button
                  onClick={() => handlePickLeft('folder')}
                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] flex items-center space-x-1"
                >
                  <FolderOpen className="w-3 h-3 text-amber-400" />
                  <span>Chọn Thư mục</span>
                </button>
              </div>
            </div>
            <input
              type="text"
              value={leftInput}
              onChange={(e) => setLeftInput(e.target.value)}
              placeholder="Chọn hoặc paste đường dẫn file/thư mục bên trái..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Right Picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-neutral-300">Bên Phải (Right Target):</label>
              <div className="flex space-x-1.5">
                <button
                  onClick={() => handlePickRight('file')}
                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] flex items-center space-x-1"
                >
                  <FileCode className="w-3 h-3 text-sky-400" />
                  <span>Chọn File</span>
                </button>
                <button
                  onClick={() => handlePickRight('folder')}
                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] flex items-center space-x-1"
                >
                  <FolderOpen className="w-3 h-3 text-amber-400" />
                  <span>Chọn Thư mục</span>
                </button>
              </div>
            </div>
            <input
              type="text"
              value={rightInput}
              onChange={(e) => setRightInput(e.target.value)}
              placeholder="Chọn hoặc paste đường dẫn file/thư mục bên phải..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartComparison}
          className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-lg text-sm transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20"
        >
          <span>Bắt đầu So sánh</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
