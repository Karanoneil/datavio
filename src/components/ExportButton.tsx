"use client";

import { useState, useRef } from "react";
import { Download, FileImage, FileText, Loader2 } from "lucide-react";

interface ExportButtonProps {
  targetSelector?: string;
  fileName?: string;
}

export function ExportButton({
  targetSelector = ".dashboard-canvas",
  fileName = "dashboard",
}: ExportButtonProps) {
  const [loading, setLoading] = useState<"pdf" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  async function exportAsImage() {
    setLoading("png");
    setError(null);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const element = document.querySelector(targetSelector) as HTMLElement;
      if (!element) {
        setError("Dashboard canvas not found.");
        return;
      }

      // Set white background for export
      const originalBg = element.style.backgroundColor;
      element.style.backgroundColor = "#ffffff";

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      element.style.backgroundColor = originalBg;

      const link = document.createElement("a");
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(null);
    }
  }

  async function exportAsPDF() {
    setLoading("pdf");
    setError(null);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const element = document.querySelector(targetSelector) as HTMLElement;
      if (!element) {
        setError("Dashboard canvas not found.");
        return;
      }

      const originalBg = element.style.backgroundColor;
      element.style.backgroundColor = "#ffffff";

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      element.style.backgroundColor = originalBg;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("l", "mm", "a4"); // landscape
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight - 20;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight - 20;
      }

      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={loading !== null}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {loading ? `Exporting ${loading.toUpperCase()}...` : "Export"}
      </button>
      {showMenu && !loading && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg">
          <button
            onClick={() => {
              setShowMenu(false);
              exportAsPDF();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5 text-red-500" />
            Export as PDF
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              exportAsImage();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <FileImage className="h-3.5 w-3.5 text-blue-500" />
            Export as PNG
          </button>
        </div>
      )}
      {error && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
