import React, { useState, useEffect } from 'react';
import {
  Download,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  X,
  Sparkles,
} from 'lucide-react';
import {
  type UpdateInfo,
  CURRENT_VERSION,
  checkForAppUpdates,
  installTauriUpdate,
} from '../../utils/updater';

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    setLoading(true);
    setError(null);
    setInstallSuccess(false);
    try {
      const res = await checkForAppUpdates();
      setUpdateInfo(res);
      if (res.error) {
        setError(res.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (downloading) return;
    setUpdateInfo(null);
    setError(null);
    setDownloading(false);
    setProgress(null);
    setInstallSuccess(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setError(null);
    checkForAppUpdates()
      .then((res) => {
        if (!active) return;
        setUpdateInfo(res);
        if (res.error) setError(res.error);
      })
      .catch((err) => {
        if (!active) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleInstall = async () => {
    setDownloading(true);
    setError(null);
    try {
      await installTauriUpdate((downloaded, total) => {
        if (total && total > 0) {
          setProgress(Math.round((downloaded / total) * 100));
        }
      });
      setInstallSuccess(true);
    } catch (err) {
      setError((err as Error).message);
      setDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none">
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl animate-in fade-in zoom-in duration-150 font-sans text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">Cập nhật AeroDiff</h3>
              <p className="text-[11px] text-neutral-400">Phiên bản hiện tại: v{CURRENT_VERSION}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={downloading}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 transition-colors cursor-pointer disabled:opacity-30"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-neutral-400">
              <RefreshCw size={24} className="animate-spin text-emerald-400" />
              <span className="text-xs">Đang kiểm tra bản cập nhật mới nhất...</span>
            </div>
          ) : error ? (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Không thể kiểm tra cập nhật</p>
                <p className="text-[11px] text-rose-400/80 mt-0.5">{error}</p>
              </div>
            </div>
          ) : updateInfo?.available ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
                <div>
                  <span className="font-semibold text-emerald-300 text-sm">
                    Đã có phiên bản mới: v{updateInfo.latestVersion}
                  </span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {updateInfo.releaseDate
                      ? `Phát hành ngày ${new Date(updateInfo.releaseDate).toLocaleDateString()}`
                      : 'Bản cập nhật được khuyến nghị'}
                  </p>
                </div>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  MỚI
                </span>
              </div>

              {/* Release Notes */}
              {updateInfo.notes && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-neutral-400">Nội dung cập nhật:</span>
                  <div className="max-h-36 overflow-y-auto rounded-lg bg-neutral-900/80 p-2.5 text-[11px] text-neutral-300 whitespace-pre-line border border-neutral-800 leading-relaxed font-mono">
                    {updateInfo.notes}
                  </div>
                </div>
              )}

              {/* Progress Bar when Downloading */}
              {downloading && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[11px] text-neutral-400">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw size={12} className="animate-spin text-emerald-400" />
                      Đang tải và cập nhật ứng dụng...
                    </span>
                    <span>{progress !== null ? `${progress}%` : 'Đang xử lý...'}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${progress ?? 10}%` }}
                    />
                  </div>
                </div>
              )}

              {installSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 p-2.5 text-emerald-300">
                  <CheckCircle2 size={16} />
                  <span>Cài đặt hoàn tất! Đang khởi động lại AeroDiff...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-center text-xs text-neutral-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-emerald-400">
                <CheckCircle2 size={20} />
              </div>
              <p className="font-medium text-neutral-200 mt-1">AeroDiff đã ở phiên bản mới nhất</p>
              <p className="text-[11px] text-neutral-500">
                Bạn đang sử dụng phiên bản v{CURRENT_VERSION}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
          <button
            onClick={handleCheck}
            disabled={loading || downloading}
            className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-200 disabled:opacity-30 cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Kiểm tra lại
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              disabled={downloading}
              className="rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors cursor-pointer disabled:opacity-30"
            >
              Đóng
            </button>

            {updateInfo?.available && (
              updateInfo.hasNativeUpdater ? (
                <button
                  onClick={handleInstall}
                  disabled={downloading || installSuccess}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-emerald-400 active:bg-emerald-600 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Download size={13} />
                  {downloading ? 'Đang cập nhật...' : 'Cập nhật ngay'}
                </button>
              ) : updateInfo.downloadUrl ? (
                <a
                  href={updateInfo.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-emerald-400 transition-colors shadow-sm cursor-pointer"
                >
                  <ExternalLink size={13} />
                  Tải trên GitHub
                </a>
              ) : null
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
