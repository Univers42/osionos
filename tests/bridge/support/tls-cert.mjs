/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tls-cert.mjs                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A throwaway self-signed certificate for `localhost`, used by the rediss:// test: the
 * client has to send the server name, and a test server is the only one that can see it.
 * The key signs nothing outside this suite and is regenerated per certificate.
 */

export const TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCfU7I60pShOG80
SXFSGXtWsWAO4vfg0dRaOt/eoNXm/xxgTDkQUWvyaNRp7glubxSOvUnegGOe2qCJ
SexL4E5549IY4Rpi34K6Gq0U2Rf0m45uYpMu+t+NFUfvl/DyUWCZ3na4/mjRYZ/A
bOauKG8/YrclHSFc+U/pMbnmc6cYVPBsl+k86JIQTvyvGehbuFkStIFgwPEubxAq
e39bGoreUbxNA52XSdBVt84IGcw7FHWYBFsrDtX6Wn/EUNEHDVj8cwMaJHbwtgac
8qUZQqQ24DI9Y7lmd85Ae1vBgcxM2ETzGPWVwDPpjlMBzbO/FBVBBF3KD44Grijk
ATI9klGvAgMBAAECggEATDSKANyLvnjxp36hNvV9Kr/4A+bHTL7P5MBYJ3GiHbRT
bDPI72ciTHWbc3cpB6sVmBgtZsDd5TMIqeGzpa8Jmf8/lCrGphflvQHZWyli7doh
S+bWIxhXKHHPUGfKFPybSb0/58e3dr5M3Iq54v7wBs8+bf/63y9X61+fXPxgJaBp
PRf2wppzr0/ruu8j/OLaEDvXB9RBfOwyXiGare3PY+FOuawmr1mG6XGvfSpt/zu+
1VVhnZeznm7OqMYR+wnPT1w9MQCm/3v4NPr+92Ye5rOTaVgWEvLwLkMsIaKOxj9U
QUXJQ+p1zJZ04JSbObJIJHXM0E0m+z9L3vT8aEXkgQKBgQDWUfkhV1mZbgmNWohM
WweepazvQQccyRmyyCPMYOLjYVDsK7kyywW01izVmi3N+Dqqe+9oymFL2epqLGyw
2ChS8Vg8emDWQdjNrxf0H080bxwTy8ya+iwANcR+PJgNKnPasvjg6+KIPua87/b+
CpRtzfvqUW3JgO2Ac20yMO184QKBgQC+T9vSUCSivHlRpRIyssVqWUAGyGUQDbzc
ltslqTbHHPRgxj0ihlsFiaHc4jP3hJziT625wbTUtLJK8WksxHtCXvdTtJt+1piw
LLJtyslK/WcIE0AQdyqKOvg/ExO4oH0PBWvVJMvm1eNfU5pXcKsWSNwLmoZdiNIw
/QrAlQuQjwKBgQCgIfl5/vEUYZJDinxCSNWlpPZUgYrV6DAKU93jjBSafhDflT+4
AteNqWUwaBWHSsxSq21TJ7uQ2A59LBo9/BQM/QTHk0ydae+apxPHtEkSzV32MJT8
yqVrtsDM7WtSkwCjTIwGSlklIZJ3YvhyEeebL4flKNhV8b4C9ruE/+fCIQKBgEey
akxXaRXuD36Uw8BZ3UntidOEV56urkIkizcrAroMzHxQ8uM43r29Vj+S8KUFTt1r
yzU6Jtgjoy/ctxToiM8+W8srNZGZYzir/iSiyyb3RIOkTPRnEJ23DaMlmr5pp/Oq
xS8th6vVVK2rH3Blv+7LUCsG8iv2ycku64gWHp89AoGAGLlA+EjT0/v3UUhFpm+B
w3ZAYwPExvABdX2UtbZ5YSAUqNn20FYKGYg5ZFboDk4ibzJY10gecgY/Ar8k7wMX
kYF2Jm3cNY09zjf1LMiT8QAIeM5XzpiT2DfB/95JnYbuA9CsOh23eoURbuUeHJEa
aZ3IgKXr9++I/MCFdtwURGo=
-----END PRIVATE KEY-----`;

export const TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIUDEoIemh0NqBbWYl0iXMwgmOvCpUwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAyMjAyNTIzMloYDzIxMjYw
OTI4MDI1MjMyWjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQCfU7I60pShOG80SXFSGXtWsWAO4vfg0dRaOt/eoNXm
/xxgTDkQUWvyaNRp7glubxSOvUnegGOe2qCJSexL4E5549IY4Rpi34K6Gq0U2Rf0
m45uYpMu+t+NFUfvl/DyUWCZ3na4/mjRYZ/AbOauKG8/YrclHSFc+U/pMbnmc6cY
VPBsl+k86JIQTvyvGehbuFkStIFgwPEubxAqe39bGoreUbxNA52XSdBVt84IGcw7
FHWYBFsrDtX6Wn/EUNEHDVj8cwMaJHbwtgac8qUZQqQ24DI9Y7lmd85Ae1vBgcxM
2ETzGPWVwDPpjlMBzbO/FBVBBF3KD44GrijkATI9klGvAgMBAAGjaTBnMB0GA1Ud
DgQWBBSu24ck6qRNy06jzH1Q2Iyg4xvbYTAfBgNVHSMEGDAWgBSu24ck6qRNy06j
zH1Q2Iyg4xvbYTAPBgNVHRMBAf8EBTADAQH/MBQGA1UdEQQNMAuCCWxvY2FsaG9z
dDANBgkqhkiG9w0BAQsFAAOCAQEAaqJhJJSEuEf+0uE0NLyyDz/i1sa+iy2IlFB8
TC2P8lzdEc3NmSBcolVCQCNh/09XLgv9VrR1KXzIL7UmAaz4f1UgXjKIFIFAxka0
UrAuuRkOM838LWi65+LE5/aGGILy/bFnd0PMb85byv1SO9UOWVdne9LZhhRf6Ryh
0pJP0yF/ww1s6q1f4YOUbtwUGA5mPcst3NiFErJWCuJfuDAtkRekf5KgNY9TVcgQ
MQ0StL3Ca6957u+VwTDJHdxf8RqdIyXm4BiGXl1X6vVT9wqsHF4kTH8UFqFxsoKG
FHYbrwJDtCSiaTNaLeXWCb0zW/Luh63Cp1lm/SLBmdTr7IaYNA==
-----END CERTIFICATE-----`;
