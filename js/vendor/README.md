# Vendored libraries

## qrcode.js (qrcode-generator 1.4.4)

- Source: npm package `qrcode-generator@1.4.4` (https://github.com/kazuhikoarase/qrcode-generator), file `qrcode.js`, unchanged.
- Licence: MIT, Copyright (c) 2009 Kazuhiko Arase (see `qrcode-LICENSE.txt`).
- sha256: `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` (56694 bytes). The admin app uses the same file and version.
- Used by: `js/install.js` (`qrSvg`) for the QR code on the portal's `/install` page. It runs in the browser with no network call.
- To update: replace the file, change the hash here and in `test/install-test.cjs`, and tell the admin session so both apps stay on one version.
