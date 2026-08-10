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

TAG_PREFIX="@talos/cli@"

version="${TALOS_VERSION:-latest}"
if [ "${version}" = "latest" ]; then
  download_url="https://github.com/${GITHUB_REPO}/releases/latest/download/${asset}"
else
  # Accept both a bare version ('0.1.3') and a full tag ('@talos/cli@0.1.3').
  tag="${version}"
  case "${tag}" in
    "${TAG_PREFIX}"*) ;;
    *) tag="${TAG_PREFIX}${tag}" ;;
  esac
  # The tag contains a '/', which must be percent-encoded to stay a single path segment.
  encoded_tag="$(printf '%s' "${tag}" | sed 's|/|%2F|g')"
  download_url="https://github.com/${GITHUB_REPO}/releases/download/${encoded_tag}/${asset}"
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
alias_link="${bin_dir}/${ALIAS}"

# Create the 'oo' symbolic link pointing to the talos binary.
ln -sf "${exe}" "${alias_link}"
success "Created '${ALIAS}' symlink at ${alias_link}"

# Marker used to detect a talos-managed block in a shell profile.
TALOS_MARKER="# talos"

# Add to PATH via the user's shell profile.
#
# Idempotent: the block is only appended when neither the talos marker nor the
# target line is already present, so re-running the installer never duplicates
# content in the shell config.
add_to_path() {
  local profile="$1"
  local line="$2"

  # Skip when the profile exists but is not writable.
  if [ -e "${profile}" ] && [ ! -w "${profile}" ]; then
    return
  fi

  if [ -e "${profile}" ]; then
    if grep -qsF "${TALOS_MARKER}" "${profile}" 2>/dev/null; then
      return
    fi
    if grep -qsF "${line}" "${profile}" 2>/dev/null; then
      return
    fi
    if grep -qsF "${bin_dir}" "${profile}" 2>/dev/null; then
      return
    fi
  fi

  echo "" >>"${profile}"
  echo "${TALOS_MARKER}" >>"${profile}"
  echo "${line}" >>"${profile}"
  info "Added ${bin_dir} to PATH in ${profile}"
}

# Add the 'oo' alias for the talos binary via a symbolic link (see above).

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
    install_completion "zsh"
    ;;
  */bash)
    profile="${HOME}/.bashrc"
    [ -f "${HOME}/.bash_profile" ] && profile="${HOME}/.bash_profile"
    add_to_path "${profile}" "export PATH=\"${bin_dir}:\$PATH\""
    install_completion "bash"
    ;;
  */fish)
    add_to_path "${HOME}/.config/fish/config.fish" "fish_add_path ${bin_dir}"
    install_completion "fish"
    ;;
  *)
    info "Manually add ${bin_dir} to your PATH."
    info "Run '${BINARY} completion:zsh', '${BINARY} completion:bash', or '${BINARY} completion:fish' to install completions."
    ;;
esac

echo ""
success "Run '${BINARY} --version' to get started (restart your shell first)."
