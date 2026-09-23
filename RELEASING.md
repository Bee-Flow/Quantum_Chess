<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Releasing Quantum Chess

Apps in the Nextcloud App Store are **code-signed**: every file of the release carries a signature made with the
app's private key, and Nextcloud checks it against a certificate issued by Nextcloud. Steps 1 to 4 are done **once**;
after that, every release is step 5: bump the version, tag, publish a GitHub release, and a workflow does the rest.

| | Step | Where | How long |
|---|---|---|---|
| 1 | Create the private key and a certificate request | your computer | 1 minute |
| 2 | Ask Nextcloud to sign the certificate | GitHub pull request | a few days (waiting) |
| 3 | Register the app in the App Store | apps.nextcloud.com | 5 minutes |
| 4 | Store the key and an App Store token as GitHub secrets | GitHub repository settings | 5 minutes |
| 5 | Release | GitHub | 10 minutes per release |

You need an account on [apps.nextcloud.com](https://apps.nextcloud.com) (you have one), the public GitHub repository
`bee-flow/quantum_chess` with `appinfo/info.xml` on its `main` branch, and `openssl` (included in macOS and Linux;
on Windows use Git Bash or WSL).

---

## 1. Create the private key and the certificate request (once)

```sh
mkdir -p ~/.nextcloud/certificates && cd ~/.nextcloud/certificates
openssl req -nodes -newkey rsa:4096 -keyout quantumchess.key -out quantumchess.csr -subj "/CN=quantumchess"
```

This creates two files:

- `quantumchess.key`: the **private key**. Keep it secret and make a backup (for example in your password manager).
  Never commit it: the repository's `.gitignore` already ignores `*.key`, `*.csr` and `*.crt`. If you lose it, you
  need a new certificate (see [Troubleshooting](#troubleshooting)).
- `quantumchess.csr`: the certificate signing request. It contains only the public key and may be shared.

## 2. Request the certificate from Nextcloud (once)

Nextcloud signs certificates through pull requests to
[nextcloud/app-certificate-requests](https://github.com/nextcloud/app-certificate-requests).

**Before you start**, check two things, because the reviewers and the DCO bot look for them:

- the app's source is public and `appinfo/info.xml` with `<id>quantumchess</id>` is visible on the `main` branch of
  https://github.com/bee-flow/quantum_chess;
- your GitHub account shows a **public e-mail address** (GitHub → Settings → Public profile → Public email). The
  commit must be *signed off* with that address (Developer Certificate of Origin).

**Easiest: in the browser**

1. Open https://github.com/nextcloud/app-certificate-requests and click **Add file → Create new file**. GitHub
   offers to fork the repository for you; accept.
2. File name: `quantumchess/quantumchess.csr`.
3. Paste the full contents of `quantumchess.csr` (from `-----BEGIN CERTIFICATE REQUEST-----` to
   `-----END CERTIFICATE REQUEST-----`).
4. Click **Commit changes…**. In the extended description write the sign-off line, with your name and your public
   e-mail address:
   ```
   Signed-off-by: Your Name <you@example.com>
   ```
5. Choose **Propose changes**, then **Create pull request**. In the description, link the source code:
   `Source code: https://github.com/bee-flow/quantum_chess`.

**Or on the command line**

```sh
gh repo fork nextcloud/app-certificate-requests --clone && cd app-certificate-requests
mkdir quantumchess && cp ~/.nextcloud/certificates/quantumchess.csr quantumchess/
git add quantumchess/quantumchess.csr
git commit -s -m "Add certificate request for quantumchess"     # -s adds the Signed-off-by line
git push && gh pr create --fill --body "Source code: https://github.com/bee-flow/quantum_chess"
```

You do not need to mention anybody; the maintainers are subscribed to the repository. When the pull request is
merged, the certificate appears at
https://github.com/nextcloud/app-certificate-requests/raw/master/quantumchess/quantumchess.crt. Download and check it:

```sh
cd ~/.nextcloud/certificates
curl -fsSLO https://github.com/nextcloud/app-certificate-requests/raw/master/quantumchess/quantumchess.crt
openssl x509 -in quantumchess.crt -noout -subject -issuer    # subject CN = quantumchess, issuer: Nextcloud
```

## 3. Register the app in the App Store (once)

1. Open https://apps.nextcloud.com/developer/apps/new (logged in).
2. **Certificate**: paste the full contents of `quantumchess.crt`.
3. **Signature**: the app id signed with your private key. Create it with:
   ```sh
   echo -n "quantumchess" | openssl dgst -sha512 -sign ~/.nextcloud/certificates/quantumchess.key | openssl base64
   ```
   and paste all lines of the output.
4. Click **Register**. The app now exists in the App Store, without releases yet.

## 4. Store the secrets in GitHub (once)

1. Get your App Store API token: https://apps.nextcloud.com/account/token (the *API token* page of your account).
2. In GitHub open **bee-flow/quantum_chess → Settings → Secrets and variables → Actions → New repository secret**
   and add:

   | Name | Value |
   |---|---|
   | `APP_PRIVATE_KEY` | the complete contents of `quantumchess.key`, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |
   | `APPSTORE_TOKEN` | the App Store API token |

The release workflow checks at the start that both secrets exist and that the key belongs to the certificate, so a
mistake here shows up before anything is published.

## 5. Publish a release (every release)

1. **Start from a green `main`**: all checks of the *CI* workflow pass.
2. **Bump the version** to `X.Y.Z` ([semantic versioning](https://semver.org): `1.0.1` for fixes, `1.1.0` for new
   features) in three places:
   - `appinfo/info.xml`: `<version>X.Y.Z</version>`
   - `package.json` and `package-lock.json`: `npm version X.Y.Z --no-git-tag-version`
   - `CHANGELOG.md`: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` (today's date), add a new empty
     `## [Unreleased]` above it, and update the links at the bottom. The App Store shows this section as the release
     notes.

   Then check: `make version-check` prints the same version three times.
3. **Commit, tag and push**:
   ```sh
   git commit -am "Release X.Y.Z"
   git tag -a vX.Y.Z -m "Quantum Chess X.Y.Z"
   git push origin main vX.Y.Z
   ```
4. **Publish a GitHub release** for the tag: **Releases → Draft a new release**, choose the tag `vX.Y.Z`, title
   `Quantum Chess X.Y.Z`, paste the changelog section as the description, and click **Publish release**. Or:
   `gh release create vX.Y.Z --title "Quantum Chess X.Y.Z" --notes "See CHANGELOG.md"`.
5. **Watch the workflow** *Build and publish app release* under **Actions**. It
   1. checks that the tag matches the versions in `info.xml`, `package.json` and `CHANGELOG.md`;
   2. builds the app (`npm ci`, `npm run build`) and packages the runtime files (`make appstore`);
   3. downloads the certificate from the certificate repository, checks it against `APP_PRIVATE_KEY`, and code-signs
      every file with `occ integrity:sign-app` (`make sign`);
   4. attaches `quantumchess-vX.Y.Z.tar.gz` to the GitHub release;
   5. uploads the release to the App Store, which verifies the signature.

   A few minutes later the new version is on https://apps.nextcloud.com/apps/quantumchess and Nextcloud servers
   offer it as an update.

**Pre-releases** such as `1.1.0-beta.1` work the same way, except for the changelog. The App Store treats versions
with a `-` as unstable (offered only to servers on the beta channel) and always shows the `## [Unreleased]` section
as their notes, so for a pre-release do **not** rename `## [Unreleased]`: write the notes there. `make version-check`
accepts that for a version with a `-` (it then checks that `## [Unreleased]` is not empty). Rename the section only
for the final release.

### Manual fallback (without GitHub Actions)

If the workflow cannot run, you can do the same by hand on a computer with PHP, Node 22 and a Nextcloud server
checkout (any version from the `min-version` in `info.xml` up; `occ` does not need to be installed):

```sh
make appstore                                   # build/artifacts/quantumchess.tar.gz
make sign KEY="$HOME/.nextcloud/certificates/quantumchess.key" \
          CERT="$HOME/.nextcloud/certificates/quantumchess.crt" \
          NEXTCLOUD=/path/to/nextcloud/server  # code-signs the files and writes quantumchess.tar.gz.sig
cp build/artifacts/quantumchess.tar.gz build/artifacts/quantumchess-vX.Y.Z.tar.gz
gh release upload vX.Y.Z build/artifacts/quantumchess-vX.Y.Z.tar.gz
```

Write `$HOME`, not `~`, in `KEY=` and `CERT=`: only bash expands a `~` after `=` in an argument (sh and zsh pass it on
literally). The copy gives the release asset the name the workflow and the README use (`gh release upload` takes the
asset name from the file; a `#name` suffix only sets a display label). The copy has the same content, so the
signature in `quantumchess.tar.gz.sig` fits it.

`make sign` writes the tarball signature the App Store asks for into `build/artifacts/quantumchess.tar.gz.sig`. It
is the same as signing the finished tarball yourself:

```sh
openssl dgst -sha512 -sign ~/.nextcloud/certificates/quantumchess.key build/artifacts/quantumchess.tar.gz | openssl base64
```

Then open https://apps.nextcloud.com/developer/apps/releases/new, enter the **download URL** of the tarball (the
release asset's link, which must be publicly downloadable), paste the **signature**, leave *Nightly* unticked and
click **Upload**. Sign the tarball only after the last change to it: any rebuild needs a new signature.

### Checking a release

On a test server, install the tarball (see the README) and run:

```sh
sudo -u www-data php occ integrity:check-app quantumchess    # no output means every file is correctly signed
```

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| *Tag vX.Y.Z does not match version …* | The tag differs from `info.xml`, `package.json` or `CHANGELOG.md`. Fix the files, delete the release and the tag (`git push --delete origin vX.Y.Z`), and tag again. |
| *The secret APP_PRIVATE_KEY is missing* / *APPSTORE_TOKEN is missing* | Add the secret (step 4). Secrets are not available to workflows in forks. |
| *APP_PRIVATE_KEY does not belong to the App Store certificate* | The secret holds another key. Paste the whole `quantumchess.key` again. |
| The certificate download fails | The certificate request (step 2) is not merged yet. |
| App Store upload: *invalid signature* or *certificate* errors | The app was registered with another certificate or key. Check step 3. |
| App Store upload: *401* or *403* | The `APPSTORE_TOKEN` is wrong or was regenerated. Copy it again from https://apps.nextcloud.com/account/token. |
| A server reports *Code integrity check failed* for Quantum Chess | Files were changed after signing (for example edited by hand on the server), or the tarball was rebuilt without signing. Reinstall the published release. |
| The private key is lost or leaked | Create a new key and request (step 1) and open a new pull request (step 2) that explains the reason, so Nextcloud can revoke the old certificate. Register the app again with the new certificate (step 3; releases signed with the old key are removed) and update `APP_PRIVATE_KEY` (step 4). |

---

## Samenvatting in het Nederlands

Apps in de Nextcloud App Store zijn **digitaal ondertekend**. Stap 1 tot en met 4 doe je **één keer**; daarna is elke
release alleen stap 5.

1. **Sleutel maken** (eenmalig, op je eigen computer):
   `openssl req -nodes -newkey rsa:4096 -keyout quantumchess.key -out quantumchess.csr -subj "/CN=quantumchess"`.
   Bewaar `quantumchess.key` geheim en maak een back-up; zet hem nooit in Git.
2. **Certificaat aanvragen** (eenmalig): open een pull request op
   https://github.com/nextcloud/app-certificate-requests die het bestand `quantumchess/quantumchess.csr` toevoegt.
   Zorg dat de broncode openbaar is met `appinfo/info.xml` op de `main`-branch, dat je GitHub-profiel een openbaar
   e-mailadres heeft, en dat de commit ondertekend is met `Signed-off-by: Naam <e-mail>` (`git commit -s`). Na de
   merge staat het certificaat op `…/raw/master/quantumchess/quantumchess.crt`.
3. **App registreren** (eenmalig) op https://apps.nextcloud.com/developer/apps/new: plak het certificaat en de
   handtekening van de app-id:
   `echo -n "quantumchess" | openssl dgst -sha512 -sign quantumchess.key | openssl base64`.
4. **GitHub-secrets** (eenmalig): voeg in de repository onder *Settings → Secrets and variables → Actions*
   `APP_PRIVATE_KEY` (de volledige inhoud van `quantumchess.key`) en `APPSTORE_TOKEN` (je API-token van
   https://apps.nextcloud.com/account/token) toe.
5. **Release uitbrengen** (elke keer): verhoog het versienummer in `appinfo/info.xml`, `package.json`
   (`npm version X.Y.Z --no-git-tag-version`) en `CHANGELOG.md` (bij een pre-release zoals `1.1.0-beta.1` blijven de
   notities onder `## [Unreleased]` staan, want die sectie toont de App Store dan); controleer met
   `make version-check`; commit, maak de tag `vX.Y.Z`, push, en publiceer een GitHub-release voor die tag. De workflow bouwt de app, ondertekent hem met
   `occ integrity:sign-app`, maakt het tarball-bestand, hangt het aan de release en uploadt het naar de App Store.

Lukt de workflow niet, dan kan het ook met de hand: `make appstore`, daarna
`make sign KEY="$HOME/…/quantumchess.key" CERT="$HOME/…/quantumchess.crt" NEXTCLOUD=/pad/naar/nextcloud` (schrijf
`$HOME`, niet `~`: alleen bash vult `~` na `=` in), het tarball-bestand als `quantumchess-vX.Y.Z.tar.gz` (eerst
kopiëren onder die naam) uploaden naar de GitHub-release, en op
https://apps.nextcloud.com/developer/apps/releases/new de download-URL en de handtekening
(`build/artifacts/quantumchess.tar.gz.sig`) invullen.
