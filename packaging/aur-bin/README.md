# diwan-bin (prebuilt package for Arch)

Installs the release `.deb` from GitHub (verified with a SHA-256) as a normal pacman package.

```sh
git clone https://github.com/yousef5/diwan && cd diwan/packaging/aur-bin
makepkg -si
```

This same PKGBUILD is meant for the AUR as `diwan-bin` (AUR registration is temporarily closed).
When bumping a release: update `pkgver` and the `.deb` checksum from `SHA256SUMS`, then `makepkg --printsrcinfo > .SRCINFO`.
