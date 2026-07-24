#!/usr/bin/env bash
set -euo pipefail

# talos installer for macOS and Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ooneex/talos/main/packages/cli/scripts/install.sh | bash
#
# Environment variables:
#   TALOS_INSTALL   Install directory (default: $HOME/.talos)
#   TALOS_VERSION   Version tag to install (default: latest)

GITHUB_REPO="ooneex/talos"
BINARY="talos"

reset="\033[0m"
red="\033[31m"
green="\033[32m"
bold="\033[1m"

error() {
  echo -e "${red}error${reset}: $*" >&2
  exit 1
}

info() {
  echo -e "${bold}$*${reset}"
}

success() {
  echo -e "${green}$*${reset}"
}

command -v curl >/dev/null 2>&1 || error "curl is required to install ${BINARY}."
command -v tar >/dev/null 2>&1 || error "tar is required to install ${BINARY}."

# Detect operating system.
os="$(uname -s)"
case "${os}" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) error "Unsupported operating system: ${os}" ;;
esac

# Detect architecture.
arch="$(uname -m)"
case "${arch}" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) error "Unsupported architecture: ${arch}" ;;
esac

target="${BINARY}-${os}-${arch}"
asset="${target}.tar.gz"

version="${TALOS_VERSION:-latest}"
if [ "${version}" = "latest" ]; then
  download_url="https://github.com/${GITHUB_REPO}/releases/latest/download/${asset}"
else
  download_url="https://github.com/${GITHUB_REPO}/releases/download/${version}/${asset}"
fi

install_dir="${TALOS_INSTALL:-${HOME}/.talos}"
bin_dir="${install_dir}/bin"
exe="${bin_dir}/${BINARY}"

info "Installing ${BINARY} (${os}-${arch})..."

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

info "Downloading ${download_url}"
if ! curl -fSL --progress-bar "${download_url}" -o "${tmp_dir}/${asset}"; then
  error "Failed to download ${asset}. Check that a release exists for '${version}'."
fi

info "Extracting archive..."
tar -xzf "${tmp_dir}/${asset}" -C "${tmp_dir}"

mkdir -p "${bin_dir}"
mv "${tmp_dir}/${BINARY}" "${exe}"
chmod +x "${exe}"

success "${BINARY} was installed successfully to ${exe}"

ALIAS="oo"

# Add to PATH via the user's shell profile.
add_to_path() {
  local profile="$1"
  local line="$2"
  if [ -w "${profile}" ] || [ ! -e "${profile}" ]; then
    if ! grep -qs "${bin_dir}" "${profile}" 2>/dev/null; then
      echo "" >>"${profile}"
      echo "# talos" >>"${profile}"
      echo "${line}" >>"${profile}"
      info "Added ${bin_dir} to PATH in ${profile}"
    fi
  fi
}

# Add the 'oo' alias for the talos binary via the user's shell profile.
add_alias() {
  local profile="$1"
  local line="$2"
  if [ -w "${profile}" ] || [ ! -e "${profile}" ]; then
    if ! grep -qs "alias ${ALIAS}=" "${profile}" 2>/dev/null; then
      echo "${line}" >>"${profile}"
      info "Added '${ALIAS}' alias for ${BINARY} in ${profile}"
    fi
  fi
}

# Install shell completions for the given shell using the freshly installed binary.
install_completion() {
  local shell="$1"
  info "Installing ${shell} completions..."
  if ! "${exe}" "completion:${shell}"; then
    info "Failed to install ${shell} completions. Run '${BINARY} completion:${shell}' manually later."
  fi
}

case "${SHELL:-}" in
  */zsh)
    add_to_path "${HOME}/.zshrc" "export PATH=\"${bin_dir}:\$PATH\""
    add_alias "${HOME}/.zshrc" "alias ${ALIAS}=\"${BINARY}\""
    install_completion "zsh"
    ;;
  */bash)
    profile="${HOME}/.bashrc"
    [ -f "${HOME}/.bash_profile" ] && profile="${HOME}/.bash_profile"
    add_to_path "${profile}" "export PATH=\"${bin_dir}:\$PATH\""
    add_alias "${profile}" "alias ${ALIAS}=\"${BINARY}\""
    install_completion "bash"
    ;;
  */fish)
    add_to_path "${HOME}/.config/fish/config.fish" "fish_add_path ${bin_dir}"
    add_alias "${HOME}/.config/fish/config.fish" "alias ${ALIAS} \"${BINARY}\""
    install_completion "fish"
    ;;
  *)
    info "Manually add ${bin_dir} to your PATH."
    info "Manually add an '${ALIAS}' alias for ${BINARY}."
    info "Run '${BINARY} completion:zsh', '${BINARY} completion:bash', or '${BINARY} completion:fish' to install completions."
    ;;
esac

echo ""
success "Run '${BINARY} --version' to get started (restart your shell first)."
