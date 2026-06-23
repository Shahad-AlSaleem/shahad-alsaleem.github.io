---
title: "baby-rsa — Crypto"
linkTitle: "baby-rsa"
weight: 1
platform: "CTF"
difficulty: "Easy"
tags: ["crypto", "rsa"]
description: "Recovering the flag from RSA with a small, factorable modulus."
---

A crypto challenge: the modulus `n` is small enough to factor, so the private key
falls out immediately.

## Solution

```python
from Crypto.Util.number import long_to_bytes
# factor n, compute d, decrypt c ...
```

Replace with your own challenge writeup. CTF entries don't need a box card —
omit the `name` front-matter field and they render as a normal doc card.
