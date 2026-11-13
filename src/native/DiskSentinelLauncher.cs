// ===================================================================
// Disk Bad Sector Scanner - Native Windows Desktop Host & Win32 Bridge (.NET C# 5)
// Compiles directly via Windows built-in csc.exe:
//   %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe /optimize+ /out:bin\native\DiskBadSectorScanner.exe src\native\DiskSentinelLauncher.cs
// License: Apache-2.0
// ===================================================================

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace DiskSentinel
{
    static class Program
    {
        private const string AppVersion = "4.6.0";
        private const string EngineVersion = "4.6.0";

        private static bool _dllLoaded = false;
        private static bool _isElevated = false;
        private static long _lastHeartbeatTicks = DateTime.UtcNow.Ticks;
        private static bool _keepRunning = true;

        #region Win32 & Native Core P/Invoke

        private const uint GENERIC_READ = 0x80000000;
        private const uint GENERIC_WRITE = 0x40000000;
        private const uint FILE_SHARE_READ = 0x00000001;
        private const uint FILE_SHARE_WRITE = 0x00000002;
        private const uint FILE_SHARE_DELETE = 0x00000004;
        private const uint OPEN_EXISTING = 3;
        private const uint FILE_FLAG_NO_BUFFERING = 0x20000000;
        private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

        private const uint IOCTL_STORAGE_QUERY_PROPERTY = 0x002D1400;
        private const uint IOCTL_STORAGE_GET_DEVICE_NUMBER = 0x002D1080;
        private const uint IOCTL_DISK_GET_DRIVE_GEOMETRY_EX = 0x000700A0;
        private const uint IOCTL_DISK_GET_LENGTH_INFO = 0x0007405C;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr LoadLibraryW(string lpLibFileName);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateFileW(
            string lpFileName,
            uint dwDesiredAccess,
            uint dwShareMode,
            IntPtr lpSecurityAttributes,
            uint dwCreationDisposition,
            uint dwFlagsAndAttributes,
            IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DeviceIoControl(
            IntPtr hDevice,
            uint dwIoControlCode,
            IntPtr lpInBuffer,
            uint nInBufferSize,
            IntPtr lpOutBuffer,
            uint nOutBufferSize,
            out uint lpBytesReturned,
            IntPtr lpOverlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetFilePointerEx(
            IntPtr hFile,
            long liDistanceToMove,
            out long lpNewFilePointer,
            uint dwMoveMethod);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ReadFile(
            IntPtr hFile,
            IntPtr lpBuffer,
            uint nNumberOfBytesToRead,
            out uint lpNumberOfBytesRead,
            IntPtr lpOverlapped);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetDiskFreeSpaceExW(
            string lpDirectoryName,
            out ulong lpFreeBytesAvailableToCaller,
            out ulong lpTotalNumberOfBytes,
            out ulong lpTotalNumberOfFreeBytes);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetVolumeInformationW(
            string lpRootPathName,
            StringBuilder lpVolumeNameBuffer,
            uint nVolumeNameSize,
            out uint lpVolumeSerialNumber,
            out uint lpMaximumComponentLength,
            out uint lpFileSystemFlags,
            StringBuilder lpFileSystemNameBuffer,
            uint nFileSystemNameSize);

        [StructLayout(LayoutKind.Sequential, Pack = 8)]
        private struct DSBlockResult
        {
            public ulong startLba;
            public ulong sectorCount;
            public double latencyMs;
            public uint statusCode;
            public uint win32ErrorCode;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
            public byte[] errorMnemonic;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 8)]
        private struct DSSmartEntry
        {
            public uint attributeId;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
            public byte[] attributeName;
            public byte currentValue;
            public byte worstValue;
            public byte thresholdValue;
            public ulong rawValue;
            public uint healthStatus;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 8)]
        private struct DSDriveHealthReport
        {
            public double reliabilityScore;
            public uint estimatedRemainingDays;
            public uint totalPowerOnHours;
            public uint reallocatedSectors;
            public uint pendingSectors;
            public uint uncorrectableErrors;
            public uint temperatureCelsius;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
            public byte[] overallGrade;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 8)]
        private struct DSNvmeHealthLog
        {
            public byte criticalWarning;
            public ushort temperatureCelsius;
            public byte availableSpare;
            public byte availableSpareThreshold;
            public byte percentageUsed;
            public double dataUnitsReadTb;
            public double dataUnitsWrittenTb;
            public ulong hostReadCommands;
            public ulong hostWriteCommands;
            public ulong controllerBusyTimeMinutes;
            public ulong powerCycles;
            public ulong powerOnHours;
            public ulong unsafeShutdowns;
            public ulong mediaErrors;
            public ulong numErrLogEntries;
            public uint warningTempTimeMin;
            public uint criticalTempTimeMin;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 8)]
        private struct DSPhysicalDriveDetail
        {
            public uint driveIndex;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
            public byte[] devicePath;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
            public byte[] model;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
            public byte[] serialNumber;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
            public byte[] firmwareRev;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
            public byte[] busType;
            public ulong totalCapacityBytes;
            public uint sectorSize;
            public uint physicalSectorSize;
            [MarshalAs(UnmanagedType.I1)]
            public bool isSsd;
            [MarshalAs(UnmanagedType.I1)]
            public bool isTrimSupported;
            [MarshalAs(UnmanagedType.I1)]
            public bool isWriteCacheEnabled;
            public uint temperatureCelsius;
            public uint healthScore;
        }

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern IntPtr DS_OpenDriveDirect(uint physicalDriveIndex, out uint outSectorSize);

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        [return: MarshalAs(UnmanagedType.I1)]
        private static extern bool DS_GetDriveDetails(IntPtr hDrive, out DSPhysicalDriveDetail outDetail);

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int DS_GetSmartTelemetry(IntPtr hDrive, [Out] DSSmartEntry[] outEntries, int maxEntries);

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        [return: MarshalAs(UnmanagedType.I1)]
        private static extern bool DS_EvaluateDriveReliability([In] DSSmartEntry[] entries, int entryCount, out DSDriveHealthReport outReport);

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        [return: MarshalAs(UnmanagedType.I1)]
        private static extern bool DS_GetNvmeDeepTelemetry(IntPtr hDrive, out DSNvmeHealthLog outLog);

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        [return: MarshalAs(UnmanagedType.I1)]
        private static extern bool DS_ScanLbaBlock(IntPtr hDrive, ulong lba, uint count, out DSBlockResult outResult);

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        [return: MarshalAs(UnmanagedType.I1)]
        private static extern bool DS_VerifyLbaBlock(IntPtr hDrive, ulong lba, uint count, out DSBlockResult outResult);

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        [return: MarshalAs(UnmanagedType.I1)]
        private static extern bool DS_AttemptSoftSectorRepair(IntPtr hDrive, ulong badLba, uint count, out uint outRecoveredStatus);

        [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern void DS_CloseDrive(IntPtr hDrive);

        [StructLayout(LayoutKind.Sequential)]
        private struct STORAGE_DEVICE_NUMBER
        {
            public uint DeviceType;
            public uint DeviceNumber;
            public uint PartitionNumber;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct STORAGE_PROPERTY_QUERY
        {
            public uint PropertyId;
            public uint QueryType;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 1)]
            public byte[] AdditionalParameters;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct STORAGE_DEVICE_DESCRIPTOR
        {
            public uint Version;
            public uint Size;
            public byte DeviceType;
            public byte DeviceTypeModifier;
            [MarshalAs(UnmanagedType.U1)]
            public bool RemovableMedia;
            [MarshalAs(UnmanagedType.U1)]
            public bool CommandQueueing;
            public uint VendorIdOffset;
            public uint ProductIdOffset;
            public uint ProductRevisionOffset;
            public uint SerialNumberOffset;
            public uint BusType;
            public uint RawPropertiesLength;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct DISK_GEOMETRY
        {
            public long Cylinders;
            public uint MediaType;
            public uint TracksPerCylinder;
            public uint SectorsPerTrack;
            public uint BytesPerSector;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct DISK_GEOMETRY_EX
        {
            public DISK_GEOMETRY Geometry;
            public long DiskSize;
            public byte Data;
        }

        #endregion

        [STAThread]
        static void Main(string[] args)
        {
            bool noUac = false;
            if (args != null && args.Length > 0)
            {
                for (int i = 0; i < args.Length; i++)
                {
                    string flag = args[i].ToLowerInvariant();
                    if (flag == "-v" || flag == "--version")
                    {
                        MessageBox.Show(
                            string.Format("Disk Bad Sector Scanner v{0}\nNative Core Engine v{1}\nDeveloper: AhBiYout", AppVersion, EngineVersion),
                            "Disk Bad Sector Scanner Version",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information);
                        return;
                    }
                    if (flag == "--no-uac")
                    {
                        noUac = true;
                    }
                }
            }

            _isElevated = CheckIsAdministrator();
            if (!_isElevated && !noUac)
            {
                try
                {
                    ProcessStartInfo elevPsi = new ProcessStartInfo();
                    elevPsi.FileName = Application.ExecutablePath;
                    elevPsi.Arguments = "--elevated-attempt";
                    elevPsi.Verb = "runas";
                    elevPsi.UseShellExecute = true;
                    Process.Start(elevPsi);
                    return;
                }
                catch (Win32Exception)
                {
                    // User declined UAC prompt; continue cleanly in Query Access mode
                }
                catch { }
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string dllPath = Path.Combine(baseDir, "DiskSentinelNativeCore.dll");
            if (File.Exists(dllPath))
            {
                IntPtr hMod = LoadLibraryW(dllPath);
                _dllLoaded = (hMod != IntPtr.Zero);
            }

            string htmlPath = FindHtmlEntry(baseDir);
            if (string.IsNullOrEmpty(htmlPath))
            {
                MessageBox.Show(
                    "Could not find 'index.html'.\nPlease ensure DiskBadSectorScanner.exe is located inside the Disk Bad Sector Scanner directory.",
                    "Disk Bad Sector Scanner - Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            int port = FindAvailablePort();
            string baseUrl = string.Format("http://127.0.0.1:{0}/", port);

            HttpListener listener = null;
            try
            {
                listener = new HttpListener();
                listener.Prefixes.Add(baseUrl);
                listener.Start();
            }
            catch
            {
                // Fallback to direct file:/// if HttpListener fails on restricted machine
                LaunchFallbackFileUrl(htmlPath);
                return;
            }

            Thread serverThread = new Thread(delegate() { RunHttpLoop(listener, htmlPath); });
            serverThread.IsBackground = true;
            serverThread.Start();

            Process edgeProc = LaunchEdgeAppWindow(baseUrl);
            if (edgeProc != null)
            {
                try
                {
                    edgeProc.WaitForExit();
                }
                catch { }
            }
            else
            {
                // Default browser fallback: stay alive while heartbeat stays active
                try { Process.Start(baseUrl); } catch { }
                while (_keepRunning)
                {
                    Thread.Sleep(2000);
                    long elapsedSec = (DateTime.UtcNow.Ticks - Interlocked.Read(ref _lastHeartbeatTicks)) / TimeSpan.TicksPerSecond;
                    if (elapsedSec > 60)
                    {
                        break;
                    }
                }
            }

            _keepRunning = false;
            try { listener.Stop(); } catch { }
        }

        private static bool CheckIsAdministrator()
        {
            try
            {
                WindowsIdentity id = WindowsIdentity.GetCurrent();
                WindowsPrincipal principal = new WindowsPrincipal(id);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }

        private static string FindHtmlEntry(string baseDir)
        {
            string[] candidates = new string[]
            {
                Path.Combine(baseDir, "index.html"),
                Path.Combine(baseDir, "dist", "index.html"),
                Path.Combine(baseDir, "..", "dist", "index.html"),
                Path.Combine(baseDir, "..", "index.html")
            };
            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return Path.GetFullPath(candidate);
                }
            }
            return null;
        }

        private static int FindAvailablePort()
        {
            TcpListener tcp = new TcpListener(IPAddress.Loopback, 0);
            tcp.Start();
            int port = ((IPEndPoint)tcp.LocalEndpoint).Port;
            tcp.Stop();
            return port;
        }

        private static Process LaunchEdgeAppWindow(string url)
        {
            string[] edgePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
            };

            string shellProfile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DiskBadSectorScanner",
                "WebShell"
            );

            foreach (string edge in edgePaths)
            {
                if (File.Exists(edge))
                {
                    try
                    {
                        Directory.CreateDirectory(shellProfile);
                        ProcessStartInfo psi = new ProcessStartInfo();
                        psi.FileName = edge;
                        psi.Arguments = string.Format(
                            "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1280,860 --no-first-run",
                            url,
                            shellProfile
                        );
                        psi.UseShellExecute = false;
                        return Process.Start(psi);
                    }
                    catch { }
                }
            }
            return null;
        }

        private static void LaunchFallbackFileUrl(string htmlPath)
        {
            string fileUrl = "file:///" + htmlPath.Replace('\\', '/');
            Process p = LaunchEdgeAppWindow(fileUrl);
            if (p == null)
            {
                try { Process.Start(fileUrl); } catch { }
            }
        }

        private static void RunHttpLoop(HttpListener listener, string htmlPath)
        {
            string webRoot = Path.GetFullPath(Path.GetDirectoryName(htmlPath));
            byte[] htmlBytes = File.ReadAllBytes(htmlPath);
            while (_keepRunning && listener.IsListening)
            {
                try
                {
                    HttpListenerContext ctx = listener.GetContext();
                    ThreadPool.QueueUserWorkItem(delegate(object state)
                    {
                        HandleRequest((HttpListenerContext)state, webRoot, htmlBytes);
                    }, ctx);
                }
                catch
                {
                    break;
                }
            }
        }

        private static string GetMimeType(string filePath)
        {
            string ext = Path.GetExtension(filePath).ToLowerInvariant();
            switch (ext)
            {
                case ".html":
                case ".htm": return "text/html; charset=utf-8";
                case ".js":
                case ".mjs": return "application/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".ico": return "image/x-icon";
                case ".woff": return "font/woff";
                case ".woff2": return "font/woff2";
                case ".wasm": return "application/wasm";
                default: return "application/octet-stream";
            }
        }

        private static void HandleRequest(HttpListenerContext ctx, string webRoot, byte[] htmlBytes)
        {
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse res = ctx.Response;
            try
            {
                string rawPath = req.Url != null ? Uri.UnescapeDataString(req.Url.AbsolutePath) : "/";
                string path = rawPath.ToLowerInvariant();
                res.Headers.Add("Cache-Control", "no-store, no-cache, must-revalidate");
                res.Headers.Add("Access-Control-Allow-Origin", "*");

                if (string.Equals(req.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                    res.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
                    res.StatusCode = 204;
                    return;
                }

                if (path == "/" || path == "/index.html")
                {
                    res.ContentType = "text/html; charset=utf-8";
                    res.ContentLength64 = htmlBytes.Length;
                    res.OutputStream.Write(htmlBytes, 0, htmlBytes.Length);
                }
                else if (path == "/api/native/status")
                {
                    string json = string.Format(
                        CultureInfo.InvariantCulture,
                        "{{\"available\":true,\"host\":\"win32-native-bridge\",\"version\":\"{0}\",\"elevated\":{1},\"dllLoaded\":{2}}}",
                        AppVersion,
                        _isElevated ? "true" : "false",
                        _dllLoaded ? "true" : "false"
                    );
                    WriteJsonResponse(res, json);
                }
                else if (path == "/api/native/heartbeat")
                {
                    Interlocked.Exchange(ref _lastHeartbeatTicks, DateTime.UtcNow.Ticks);
                    WriteJsonResponse(res, "{\"ok\":true}");
                }
                else if (path == "/api/native/drives")
                {
                    Interlocked.Exchange(ref _lastHeartbeatTicks, DateTime.UtcNow.Ticks);
                    WriteJsonResponse(res, BuildPhysicalDrivesJson());
                }
                else if (path == "/api/native/temperatures")
                {
                    WriteJsonResponse(res, BuildTemperaturesJson());
                }
                else if (path == "/api/native/scan-block" || path == "/api/native/verify-block")
                {
                    string body = ReadRequestBody(req);
                    uint driveIdx = ExtractJsonUInt(body, "driveIndex", 0);
                    ulong lba = ExtractJsonULong(body, "lba", 0);
                    uint count = ExtractJsonUInt(body, "sectorCount", 128);
                    bool isVerify = path.EndsWith("verify-block");
                    WriteJsonResponse(res, ExecuteBlockProbeJson(driveIdx, lba, count, isVerify));
                }
                else if (path == "/api/native/repair-block")
                {
                    string body = ReadRequestBody(req);
                    uint driveIdx = ExtractJsonUInt(body, "driveIndex", 0);
                    ulong lba = ExtractJsonULong(body, "lba", 0);
                    uint count = ExtractJsonUInt(body, "count", 8);
                    WriteJsonResponse(res, ExecuteRepairBlockJson(driveIdx, lba, count));
                }
                else if (path == "/api/native/read-sector")
                {
                    string body = ReadRequestBody(req);
                    uint driveIdx = ExtractJsonUInt(body, "driveIndex", 0);
                    ulong lba = ExtractJsonULong(body, "lba", 0);
                    uint size = ExtractJsonUInt(body, "size", 512);
                    WriteJsonResponse(res, ExecuteReadSectorJson(driveIdx, lba, size));
                }
                else
                {
                    // Serve static bundle assets (e.g. /assets/*.js, /assets/*.css, icons) safely from webRoot
                    string relPath = rawPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                    if (!string.IsNullOrEmpty(relPath))
                    {
                        string candidate = Path.GetFullPath(Path.Combine(webRoot, relPath));
                        if (candidate.StartsWith(webRoot, StringComparison.OrdinalIgnoreCase) && File.Exists(candidate))
                        {
                            byte[] fileBytes = File.ReadAllBytes(candidate);
                            res.ContentType = GetMimeType(candidate);
                            res.ContentLength64 = fileBytes.Length;
                            res.OutputStream.Write(fileBytes, 0, fileBytes.Length);
                            return;
                        }
                    }

                    res.StatusCode = 404;
                    WriteJsonResponse(res, "{\"error\":\"not_found\"}");
                }
            }
            catch (Exception ex)
            {
                try
                {
                    res.StatusCode = 500;
                    WriteJsonResponse(res, string.Format("{{\"error\":\"{0}\"}}", JsonEscape(ex.Message)));
                }
                catch { }
            }
            finally
            {
                try { res.OutputStream.Close(); } catch { }
            }
        }

        private static string ReadRequestBody(HttpListenerRequest req)
        {
            using (StreamReader reader = new StreamReader(req.InputStream, Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }

        private static void WriteJsonResponse(HttpListenerResponse res, string json)
        {
            byte[] buf = Encoding.UTF8.GetBytes(json);
            res.ContentType = "application/json; charset=utf-8";
            res.ContentLength64 = buf.Length;
            res.OutputStream.Write(buf, 0, buf.Length);
        }

        private class VolumePartitionInfo
        {
            public string DriveLetter;
            public string Label;
            public string Filesystem;
            public ulong TotalBytes;
            public ulong FreeBytes;
            public ulong UsedBytes;
        }

        private static Dictionary<uint, List<VolumePartitionInfo>> GetVolumeMappings()
        {
            Dictionary<uint, List<VolumePartitionInfo>> map = new Dictionary<uint, List<VolumePartitionInfo>>();
            for (char letter = 'A'; letter <= 'Z'; letter++)
            {
                string devPath = string.Format("\\\\.\\{0}:", letter);
                IntPtr hVol = CreateFileW(
                    devPath,
                    0,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    IntPtr.Zero,
                    OPEN_EXISTING,
                    0,
                    IntPtr.Zero
                );
                if (hVol == INVALID_HANDLE_VALUE) continue;

                uint bytesRet = 0;
                int size = Marshal.SizeOf(typeof(STORAGE_DEVICE_NUMBER));
                IntPtr ptr = Marshal.AllocHGlobal(size);
                bool ok = DeviceIoControl(hVol, IOCTL_STORAGE_GET_DEVICE_NUMBER, IntPtr.Zero, 0, ptr, (uint)size, out bytesRet, IntPtr.Zero);
                STORAGE_DEVICE_NUMBER sdn = (STORAGE_DEVICE_NUMBER)Marshal.PtrToStructure(ptr, typeof(STORAGE_DEVICE_NUMBER));
                Marshal.FreeHGlobal(ptr);
                CloseHandle(hVol);

                if (!ok) continue;

                string rootPath = string.Format("{0}:\\", letter);
                ulong avail, totalB = 0, freeB = 0;
                GetDiskFreeSpaceExW(rootPath, out avail, out totalB, out freeB);

                StringBuilder volName = new StringBuilder(260);
                StringBuilder fsName = new StringBuilder(260);
                uint serialNum, maxComp, fsFlags;
                bool volOk = GetVolumeInformationW(rootPath, volName, 260, out serialNum, out maxComp, out fsFlags, fsName, 260);

                VolumePartitionInfo info = new VolumePartitionInfo();
                info.DriveLetter = string.Format("{0}:", letter);
                info.Label = volOk ? volName.ToString().Trim() : "";
                info.Filesystem = volOk ? fsName.ToString().Trim() : "";
                info.TotalBytes = totalB;
                info.FreeBytes = freeB;
                info.UsedBytes = totalB > freeB ? totalB - freeB : 0;

                if (!map.ContainsKey(sdn.DeviceNumber))
                {
                    map[sdn.DeviceNumber] = new List<VolumePartitionInfo>();
                }
                map[sdn.DeviceNumber].Add(info);
            }
            return map;
        }

        private static string BuildPhysicalDrivesJson()
        {
            Dictionary<uint, List<VolumePartitionInfo>> volumeMap = GetVolumeMappings();
            StringBuilder sb = new StringBuilder();
            sb.Append("[");
            bool first = true;

            for (uint i = 0; i < 32; i++)
            {
                bool found = false;
                string devicePath = string.Format("\\\\.\\PhysicalDrive{0}", i);
                string model = "";
                string serial = "";
                string firmware = "N/A";
                string bus = "Standard Storage";
                ulong capBytes = 0;
                uint secSize = 512;
                uint physSecSize = 4096;
                bool isSsd = false;
                bool isTrim = false;
                int tempC = 0;
                double? reliabilityScore = null;
                ulong? powerOnHours = null;
                string nvmeJson = "null";
                string smartJson = "[]";

                if (_dllLoaded)
                {
                    try
                    {
                        uint outSec = 512;
                        IntPtr hDrive = DS_OpenDriveDirect(i, out outSec);
                        if (hDrive != IntPtr.Zero)
                        {
                            found = true;
                            secSize = outSec > 0 ? outSec : 512;
                            DSPhysicalDriveDetail detail;
                            if (DS_GetDriveDetails(hDrive, out detail))
                            {
                                model = BytesToAscii(detail.model);
                                serial = BytesToAscii(detail.serialNumber);
                                firmware = BytesToAscii(detail.firmwareRev);
                                bus = BytesToAscii(detail.busType);
                                capBytes = detail.totalCapacityBytes;
                                if (detail.sectorSize > 0) secSize = detail.sectorSize;
                                if (detail.physicalSectorSize > 0) physSecSize = detail.physicalSectorSize;
                                isSsd = detail.isSsd;
                                isTrim = detail.isTrimSupported;
                                if (detail.temperatureCelsius > 0 && detail.temperatureCelsius < 150)
                                {
                                    tempC = (int)detail.temperatureCelsius;
                                }
                            }

                            DSSmartEntry[] entries = new DSSmartEntry[64];
                            int entryCount = DS_GetSmartTelemetry(hDrive, entries, 64);
                            if (entryCount > 0)
                            {
                                DSDriveHealthReport report;
                                if (DS_EvaluateDriveReliability(entries, entryCount, out report))
                                {
                                    reliabilityScore = report.reliabilityScore;
                                    if (tempC == 0 && report.temperatureCelsius > 0 && report.temperatureCelsius < 150)
                                    {
                                        tempC = (int)report.temperatureCelsius;
                                    }
                                }

                                StringBuilder smartSb = new StringBuilder();
                                smartSb.Append("[");
                                for (int j = 0; j < entryCount; j++)
                                {
                                    if (j > 0) smartSb.Append(",");
                                    DSSmartEntry se = entries[j];
                                    if (se.attributeId == 0x09)
                                    {
                                        powerOnHours = se.rawValue & 0xFFFFFFFF;
                                    }
                                    string st = se.healthStatus == 0 ? "good" : (se.healthStatus == 1 ? "warning" : "critical");
                                    smartSb.AppendFormat(
                                        CultureInfo.InvariantCulture,
                                        "{{\"id\":{0},\"name\":\"{1}\",\"current\":{2},\"worst\":{3},\"threshold\":{4},\"raw\":\"{5}\",\"rawHex\":\"0x{6:X12}\",\"status\":\"{7}\"}}",
                                        se.attributeId,
                                        JsonEscape(BytesToAscii(se.attributeName)),
                                        se.currentValue,
                                        se.worstValue,
                                        se.thresholdValue,
                                        se.rawValue,
                                        se.rawValue & 0xFFFFFFFFFFFF,
                                        st
                                    );
                                }
                                smartSb.Append("]");
                                smartJson = smartSb.ToString();
                            }

                            if (isSsd && string.Equals(bus, "NVMe", StringComparison.OrdinalIgnoreCase))
                            {
                                DSNvmeHealthLog nvme;
                                if (DS_GetNvmeDeepTelemetry(hDrive, out nvme))
                                {
                                    if (nvme.temperatureCelsius > 0 && nvme.temperatureCelsius < 150)
                                    {
                                        tempC = nvme.temperatureCelsius;
                                    }
                                    powerOnHours = nvme.powerOnHours;
                                    double nvmeScore = 100.0 - Math.Min(90.0, (double)nvme.percentageUsed);
                                    if (nvme.mediaErrors > 0) nvmeScore -= Math.Min(45.0, (double)nvme.mediaErrors * 10.0);
                                    if (nvme.availableSpare < nvme.availableSpareThreshold) nvmeScore -= 25.0;
                                    reliabilityScore = Math.Max(0.0, Math.Min(100.0, nvmeScore));

                                    nvmeJson = string.Format(
                                        CultureInfo.InvariantCulture,
                                        "{{\"percentageUsed\":{0},\"dataUnitsReadTb\":{1},\"dataUnitsWrittenTb\":{2},\"hostReadCommands\":{3},\"hostWriteCommands\":{4},\"controllerBusyTimeMinutes\":{5},\"powerCycles\":{6},\"powerOnHours\":{7},\"unsafeShutdowns\":{8},\"mediaErrors\":{9},\"numErrLogEntries\":{10},\"availableSpare\":{11},\"availableSpareThreshold\":{12},\"criticalWarning\":{13}}}",
                                        nvme.percentageUsed,
                                        nvme.dataUnitsReadTb,
                                        nvme.dataUnitsWrittenTb,
                                        nvme.hostReadCommands,
                                        nvme.hostWriteCommands,
                                        nvme.controllerBusyTimeMinutes,
                                        nvme.powerCycles,
                                        nvme.powerOnHours,
                                        nvme.unsafeShutdowns,
                                        nvme.mediaErrors,
                                        nvme.numErrLogEntries,
                                        nvme.availableSpare,
                                        nvme.availableSpareThreshold,
                                        nvme.criticalWarning
                                    );
                                }
                            }

                            DS_CloseDrive(hDrive);
                        }
                    }
                    catch { }
                }

                // Pure Win32 API fallback (works even if DiskSentinelNativeCore.dll is absent)
                if (!found)
                {
                    found = ProbeDriveViaWin32(i, ref model, ref serial, ref firmware, ref bus, ref capBytes, ref secSize, ref isSsd);
                }

                if (!found) continue;

                if (!first) sb.Append(",");
                first = false;

                if (string.IsNullOrEmpty(model)) model = string.Format("Physical Storage Drive {0}", i);
                if (string.IsNullOrEmpty(firmware)) firmware = "N/A";
                bool isExternal = bus.ToLowerInvariant().Contains("usb");

                List<VolumePartitionInfo> vols = volumeMap.ContainsKey(i) ? volumeMap[i] : new List<VolumePartitionInfo>();
                StringBuilder mountSb = new StringBuilder();
                StringBuilder partSb = new StringBuilder();
                mountSb.Append("[");
                partSb.Append("[");
                for (int v = 0; v < vols.Count; v++)
                {
                    VolumePartitionInfo vp = vols[v];
                    if (v > 0) { mountSb.Append(","); partSb.Append(","); }
                    mountSb.AppendFormat("\"{0}\"", JsonEscape(vp.DriveLetter));
                    double gbDiv = 1024.0 * 1024.0 * 1024.0;
                    partSb.AppendFormat(
                        CultureInfo.InvariantCulture,
                        "{{\"driveLetter\":\"{0}\",\"label\":\"{1}\",\"filesystem\":\"{2}\",\"totalBytes\":{3},\"freeBytes\":{4},\"usedBytes\":{5},\"totalGb\":{6},\"usedGb\":{7}}}",
                        JsonEscape(vp.DriveLetter),
                        JsonEscape(vp.Label),
                        JsonEscape(vp.Filesystem),
                        vp.TotalBytes,
                        vp.FreeBytes,
                        vp.UsedBytes,
                        Math.Round(vp.TotalBytes / gbDiv),
                        Math.Round(vp.UsedBytes / gbDiv)
                    );
                }
                mountSb.Append("]");
                partSb.Append("]");

                sb.AppendFormat(
                    CultureInfo.InvariantCulture,
                    "{{\"driveIndex\":{0},\"devicePath\":\"{1}\",\"model\":\"{2}\",\"serialNumber\":\"{3}\",\"firmware\":\"{4}\",\"busType\":\"{5}\",\"isSsd\":{6},\"isTrimSupported\":{7},\"isExternal\":{8},\"connectionType\":\"{9}\",\"mountPoints\":{10},\"partitions\":{11},\"totalCapacityBytes\":{12},\"totalCapacityGb\":{13},\"sectorSize\":{14},\"physicalSectorSize\":{15},\"temperatureC\":{16},\"reliabilityScore\":{17},\"powerOnHours\":{18},\"nvmeTelemetry\":{19},\"smartAttributes\":{20}}}",
                    i,
                    JsonEscape(devicePath),
                    JsonEscape(model),
                    JsonEscape(serial),
                    JsonEscape(firmware),
                    JsonEscape(bus),
                    isSsd ? "true" : "false",
                    isTrim ? "true" : "false",
                    isExternal ? "true" : "false",
                    isExternal ? "usb" : "internal",
                    mountSb.ToString(),
                    partSb.ToString(),
                    capBytes,
                    capBytes / (1024UL * 1024UL * 1024UL),
                    secSize,
                    physSecSize,
                    tempC > 0 ? tempC.ToString(CultureInfo.InvariantCulture) : "null",
                    reliabilityScore.HasValue ? reliabilityScore.Value.ToString("F1", CultureInfo.InvariantCulture) : "null",
                    powerOnHours.HasValue ? powerOnHours.Value.ToString(CultureInfo.InvariantCulture) : "null",
                    nvmeJson,
                    smartJson
                );
            }

            sb.Append("]");
            return sb.ToString();
        }

        private static bool ProbeDriveViaWin32(
            uint driveIdx,
            ref string model,
            ref string serial,
            ref string firmware,
            ref string bus,
            ref ulong capBytes,
            ref uint secSize,
            ref bool isSsd)
        {
            string devPath = string.Format("\\\\.\\PhysicalDrive{0}", driveIdx);
            IntPtr h = CreateFileW(devPath, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            if (h == INVALID_HANDLE_VALUE)
            {
                h = CreateFileW(devPath, 0, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            }
            if (h == INVALID_HANDLE_VALUE) return false;

            try
            {
                // 1. Capacity & Sector Size via IOCTL_DISK_GET_DRIVE_GEOMETRY_EX
                uint bytesRet = 0;
                IntPtr geomPtr = Marshal.AllocHGlobal(256);
                if (DeviceIoControl(h, IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, IntPtr.Zero, 0, geomPtr, 256, out bytesRet, IntPtr.Zero))
                {
                    DISK_GEOMETRY_EX geom = (DISK_GEOMETRY_EX)Marshal.PtrToStructure(geomPtr, typeof(DISK_GEOMETRY_EX));
                    if (geom.DiskSize > 0) capBytes = (ulong)geom.DiskSize;
                    if (geom.Geometry.BytesPerSector >= 512) secSize = geom.Geometry.BytesPerSector;
                }
                Marshal.FreeHGlobal(geomPtr);

                if (capBytes == 0)
                {
                    IntPtr lenPtr = Marshal.AllocHGlobal(8);
                    if (DeviceIoControl(h, IOCTL_DISK_GET_LENGTH_INFO, IntPtr.Zero, 0, lenPtr, 8, out bytesRet, IntPtr.Zero))
                    {
                        long lenVal = Marshal.ReadInt64(lenPtr);
                        if (lenVal > 0) capBytes = (ulong)lenVal;
                    }
                    Marshal.FreeHGlobal(lenPtr);
                }

                // 2. Model, Serial, BusType via IOCTL_STORAGE_QUERY_PROPERTY (StorageDeviceProperty = 0)
                int qSize = 12;
                IntPtr qPtr = Marshal.AllocHGlobal(qSize);
                for (int b = 0; b < qSize; b++) Marshal.WriteByte(qPtr, b, 0);
                IntPtr descBuf = Marshal.AllocHGlobal(2048);
                if (DeviceIoControl(h, IOCTL_STORAGE_QUERY_PROPERTY, qPtr, (uint)qSize, descBuf, 2048, out bytesRet, IntPtr.Zero) &&
                    bytesRet >= Marshal.SizeOf(typeof(STORAGE_DEVICE_DESCRIPTOR)))
                {
                    STORAGE_DEVICE_DESCRIPTOR desc = (STORAGE_DEVICE_DESCRIPTOR)Marshal.PtrToStructure(descBuf, typeof(STORAGE_DEVICE_DESCRIPTOR));
                    if (desc.ProductIdOffset > 0 && desc.ProductIdOffset < bytesRet)
                    {
                        model = ReadAnsiZ(descBuf, (int)desc.ProductIdOffset, (int)bytesRet).Trim();
                    }
                    if (desc.SerialNumberOffset > 0 && desc.SerialNumberOffset < bytesRet)
                    {
                        serial = ReadAnsiZ(descBuf, (int)desc.SerialNumberOffset, (int)bytesRet).Trim();
                    }
                    if (desc.ProductRevisionOffset > 0 && desc.ProductRevisionOffset < bytesRet)
                    {
                        firmware = ReadAnsiZ(descBuf, (int)desc.ProductRevisionOffset, (int)bytesRet).Trim();
                    }
                    switch (desc.BusType)
                    {
                        case 17: bus = "NVMe"; isSsd = true; break;
                        case 11: bus = "SATA"; break;
                        case 7: bus = "USB"; break;
                        case 1:
                        case 10: bus = "SCSI/SAS"; break;
                        default: bus = "Standard Storage"; break;
                    }
                }
                Marshal.FreeHGlobal(descBuf);

                // 3. Seek Penalty (StorageDeviceSeekPenaltyProperty = 7)
                Marshal.WriteInt32(qPtr, 0, 7);
                IntPtr seekBuf = Marshal.AllocHGlobal(16);
                if (DeviceIoControl(h, IOCTL_STORAGE_QUERY_PROPERTY, qPtr, (uint)qSize, seekBuf, 16, out bytesRet, IntPtr.Zero) && bytesRet >= 8)
                {
                    byte incursSeekPenalty = Marshal.ReadByte(seekBuf, 4);
                    isSsd = (incursSeekPenalty == 0);
                }
                Marshal.FreeHGlobal(seekBuf);
                Marshal.FreeHGlobal(qPtr);

                return true;
            }
            finally
            {
                CloseHandle(h);
            }
        }

        private static string BuildTemperaturesJson()
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("[");
            bool first = true;
            if (_dllLoaded)
            {
                for (uint i = 0; i < 32; i++)
                {
                    uint outSec = 512;
                    IntPtr h = DS_OpenDriveDirect(i, out outSec);
                    if (h == IntPtr.Zero) continue;
                    int tempC = 0;
                    DSPhysicalDriveDetail detail;
                    if (DS_GetDriveDetails(h, out detail) && detail.temperatureCelsius > 0 && detail.temperatureCelsius < 150)
                    {
                        tempC = (int)detail.temperatureCelsius;
                    }
                    if (tempC == 0)
                    {
                        DSSmartEntry[] entries = new DSSmartEntry[32];
                        int cnt = DS_GetSmartTelemetry(h, entries, 32);
                        for (int j = 0; j < cnt; j++)
                        {
                            if (entries[j].attributeId == 0xC2 || entries[j].attributeId == 0xBE)
                            {
                                int t = (int)(entries[j].rawValue & 0xFF);
                                if (t > 0 && t < 150) { tempC = t; break; }
                            }
                        }
                    }
                    DS_CloseDrive(h);

                    if (!first) sb.Append(",");
                    first = false;
                    sb.AppendFormat(
                        CultureInfo.InvariantCulture,
                        "{{\"driveIndex\":{0},\"temperatureC\":{1}}}",
                        i,
                        tempC > 0 ? tempC.ToString(CultureInfo.InvariantCulture) : "null"
                    );
                }
            }
            sb.Append("]");
            return sb.ToString();
        }

        private static string ExecuteBlockProbeJson(uint driveIndex, ulong lba, uint count, bool isVerify)
        {
            if (_dllLoaded)
            {
                try
                {
                    uint outSec = 512;
                    IntPtr h = DS_OpenDriveDirect(driveIndex, out outSec);
                    if (h != IntPtr.Zero)
                    {
                        DSBlockResult res;
                        bool ok = isVerify
                            ? DS_VerifyLbaBlock(h, lba, count, out res)
                            : DS_ScanLbaBlock(h, lba, count, out res);
                        DS_CloseDrive(h);
                        if (ok || res.win32ErrorCode != 0)
                        {
                            return string.Format(
                                CultureInfo.InvariantCulture,
                                "{{\"startLba\":{0},\"sectorCount\":{1},\"latencyMs\":{2},\"statusCode\":{3},\"win32ErrorCode\":{4}}}",
                                lba,
                                count,
                                res.latencyMs,
                                res.statusCode,
                                res.win32ErrorCode
                            );
                        }
                    }
                }
                catch { }
            }

            // Direct Win32 ReadFile probe fallback
            string devPath = string.Format("\\\\.\\PhysicalDrive{0}", driveIndex);
            IntPtr hRaw = CreateFileW(
                devPath,
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                IntPtr.Zero,
                OPEN_EXISTING,
                FILE_FLAG_NO_BUFFERING,
                IntPtr.Zero
            );
            if (hRaw == INVALID_HANDLE_VALUE)
            {
                int err = Marshal.GetLastWin32Error();
                return string.Format(
                    CultureInfo.InvariantCulture,
                    "{{\"startLba\":{0},\"sectorCount\":{1},\"latencyMs\":0,\"statusCode\":4,\"win32ErrorCode\":{2}}}",
                    lba,
                    count,
                    err
                );
            }

            try
            {
                uint readBytes = Math.Min(count, 128U) * 512U;
                if (readBytes < 512) readBytes = 512;
                long offset = (long)(lba * 512UL);
                long newPos;
                IntPtr buf = Marshal.AllocHGlobal((int)readBytes + 4096);
                IntPtr aligned = new IntPtr(((buf.ToInt64() + 4095L) / 4096L) * 4096L);

                Stopwatch sw = Stopwatch.StartNew();
                bool seekOk = SetFilePointerEx(hRaw, offset, out newPos, 0);
                uint bytesRead = 0;
                bool readOk = seekOk && ReadFile(hRaw, aligned, readBytes, out bytesRead, IntPtr.Zero);
                sw.Stop();
                int winErr = readOk ? 0 : Marshal.GetLastWin32Error();
                Marshal.FreeHGlobal(buf);

                double ms = sw.Elapsed.TotalMilliseconds;
                uint statusCode = !readOk ? 4U : (ms >= 150.0 ? 3U : (ms >= 50.0 ? 2U : (ms >= 10.0 ? 1U : 0U)));
                return string.Format(
                    CultureInfo.InvariantCulture,
                    "{{\"startLba\":{0},\"sectorCount\":{1},\"latencyMs\":{2:F3},\"statusCode\":{3},\"win32ErrorCode\":{4}}}",
                    lba,
                    count,
                    ms,
                    statusCode,
                    winErr
                );
            }
            finally
            {
                CloseHandle(hRaw);
            }
        }

        private static string ExecuteRepairBlockJson(uint driveIndex, ulong lba, uint count)
        {
            if (!_dllLoaded) return "{\"success\":false,\"recoveredStatus\":0}";
            uint outSec = 512;
            IntPtr h = DS_OpenDriveDirect(driveIndex, out outSec);
            if (h == IntPtr.Zero) return "{\"success\":false,\"recoveredStatus\":5}";
            uint status = 0;
            bool ok = DS_AttemptSoftSectorRepair(h, lba, count, out status);
            DS_CloseDrive(h);
            return string.Format(
                CultureInfo.InvariantCulture,
                "{{\"success\":{0},\"recoveredStatus\":{1}}}",
                ok ? "true" : "false",
                status
            );
        }

        private static string ExecuteReadSectorJson(uint driveIndex, ulong lba, uint requestedSize)
        {
            uint alignedSize = ((Math.Max(512U, Math.Min(65536U, requestedSize)) + 511U) / 512U) * 512U;
            string devPath = string.Format("\\\\.\\PhysicalDrive{0}", driveIndex);
            IntPtr hRaw = CreateFileW(
                devPath,
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                IntPtr.Zero,
                OPEN_EXISTING,
                FILE_FLAG_NO_BUFFERING,
                IntPtr.Zero
            );
            if (hRaw == INVALID_HANDLE_VALUE)
            {
                return "{\"ok\":false,\"bytes\":[]}";
            }

            try
            {
                long offset = (long)(lba * 512UL);
                long newPos;
                IntPtr buf = Marshal.AllocHGlobal((int)alignedSize + 4096);
                IntPtr aligned = new IntPtr(((buf.ToInt64() + 4095L) / 4096L) * 4096L);
                uint bytesRead = 0;
                bool ok = SetFilePointerEx(hRaw, offset, out newPos, 0) &&
                          ReadFile(hRaw, aligned, alignedSize, out bytesRead, IntPtr.Zero) &&
                          bytesRead > 0;
                byte[] data = null;
                if (ok)
                {
                    uint count = Math.Min(requestedSize, bytesRead);
                    data = new byte[count];
                    Marshal.Copy(aligned, data, 0, (int)count);
                }
                Marshal.FreeHGlobal(buf);

                if (data == null)
                {
                    return "{\"ok\":false,\"bytes\":[]}";
                }

                StringBuilder sb = new StringBuilder();
                sb.Append("{\"ok\":true,\"bytes\":[");
                for (int i = 0; i < data.Length; i++)
                {
                    if (i > 0) sb.Append(",");
                    sb.Append(data[i].ToString(CultureInfo.InvariantCulture));
                }
                sb.Append("]}");
                return sb.ToString();
            }
            finally
            {
                CloseHandle(hRaw);
            }
        }

        private static string ReadAnsiZ(IntPtr basePtr, int offset, int maxLen)
        {
            List<byte> bytes = new List<byte>();
            for (int i = offset; i < maxLen; i++)
            {
                byte b = Marshal.ReadByte(basePtr, i);
                if (b == 0) break;
                bytes.Add(b);
            }
            return Encoding.ASCII.GetString(bytes.ToArray());
        }

        private static string BytesToAscii(byte[] raw)
        {
            if (raw == null) return "";
            int len = Array.IndexOf<byte>(raw, 0);
            if (len < 0) len = raw.Length;
            return Encoding.UTF8.GetString(raw, 0, len).Trim();
        }

        private static string JsonEscape(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        }

        private static uint ExtractJsonUInt(string json, string key, uint fallback)
        {
            ulong v = ExtractJsonULong(json, key, fallback);
            return v > uint.MaxValue ? fallback : (uint)v;
        }

        private static ulong ExtractJsonULong(string json, string key, ulong fallback)
        {
            if (string.IsNullOrEmpty(json)) return fallback;
            Match m = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*(\\d+)");
            if (m.Success)
            {
                ulong val;
                if (ulong.TryParse(m.Groups[1].Value, out val)) return val;
            }
            return fallback;
        }
    }
}
