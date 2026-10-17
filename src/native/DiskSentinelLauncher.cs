// ===================================================================
// DiskSentinel Pro - Zero-Dependency Native Windows Host (.NET / C#)
// Compiles directly via Windows built-in csc.exe:
//   %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /out:dist\DiskSentinelPro.exe src\native\DiskSentinelLauncher.cs
// License: Apache-2.0
// ===================================================================

using System;
using System.Diagnostics;
using System.IO;
using System.Security.Principal;
using System.Windows.Forms;

namespace DiskSentinel
{
    static class Program
    {
        private const string AppVersion = "4.5.0";
        private const string EngineVersion = "4.5.0";

        [STAThread]
        static void Main(string[] args)
        {
            if (args.Length > 0)
            {
                string flag = args[0].ToLowerInvariant();
                if (flag == "-v" || flag == "--version")
                {
                    MessageBox.Show(
                        string.Format("DiskSentinel Pro v{0}\nNative Core Engine v{1}\nDeveloper: AhBiYout", AppVersion, EngineVersion),
                        "DiskSentinel Pro Version",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    return;
                }
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string[] candidates = new string[]
            {
                Path.Combine(baseDir, "index.html"),
                Path.Combine(baseDir, "dist", "index.html"),
                Path.Combine(baseDir, "..", "dist", "index.html"),
                Path.Combine(baseDir, "..", "index.html")
            };

            string htmlPath = null;
            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    htmlPath = Path.GetFullPath(candidate);
                    break;
                }
            }

            if (string.IsNullOrEmpty(htmlPath))
            {
                MessageBox.Show(
                    "Could not find 'index.html'.\nPlease ensure DiskSentinelPro.exe is located inside the DiskSentinelPro directory.",
                    "DiskSentinel Pro - Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            string fileUrl = "file:///" + htmlPath.Replace('\\', '/');

            // Look for Microsoft Edge to launch dedicated standalone App Window
            string[] edgePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe")
            };

            bool launched = false;
            foreach (string edge in edgePaths)
            {
                if (File.Exists(edge))
                {
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo();
                        psi.FileName = edge;
                        psi.Arguments = string.Format("--app=\"{0}\" --window-size=1280,820", fileUrl);
                        psi.UseShellExecute = false;
                        Process.Start(psi);
                        launched = true;
                        break;
                    }
                    catch { }
                }
            }

            if (!launched)
            {
                // Fallback: Open in default browser
                Process.Start(fileUrl);
            }
        }
    }
}
