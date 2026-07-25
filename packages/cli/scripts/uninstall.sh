#!/usr/bin/env bash
set -euo pipefail

# talos uninstaller for macOS and Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ooneex/talos/main/packages/cli/scripts/uninstall.sh | bash
#
# Environment variables:
#   TALOS_INSTALL   Install directory to remove (default: $HOME/.talos)

GITHUB_REPO="ooneex/talos"
BINARY="talos"
ALIAS="oo"

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

install_dir="${TALOS_INSTALL:-${HOME}/.talos}"
bin_dir="${install_dir}/bin"

info "Uninstalling ${BINARY}..."

# Remove the 'oo' symbolic link.
alias_link="${bin_dir}/${ALIAS}"
if [ -L "${alias_link}" ] || [ -e "${alias_link}" ]; then
  rm -f "${alias_link}"
  info "Removed '${ALIAS}' symlink at ${alias_link}"
fi

# Remove the install directory.
if [ -d "${install_dir}" ]; then
  rm -rf "${install_dir}"
  success "Removed ${install_dir}"
else
  info "${install_dir} not found; nothing to remove."
fi

# Remove the PATH block added by the installer from the user's shell profile.
remove_from_profile() {
  local profile="$1"
  [ -f "${profile}" ] || return 0
  [ -w "${profile}" ] || return 0

  if grep -qs "${bin_dir}" "${profile}" 2>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    # Drop the '# talos' comment and the following PATH line, plus any leftover
    # 'oo' alias lines from older installs.
    awk -v bindir="${bin_dir}" -v al="${ALIAS}" '
      $0 == "# talos" { skip = 1; next }
      skip == 1 { skip = 0; next }
      index($0, bindir) > 0 { next }
      $0 ~ ("alias " al "=") { next }
      $0 ~ ("alias " al " ") { next }
      { print }
    ' "${profile}" >"${tmp}"
    mv "${tmp}" "${profile}"
    info "Cleaned talos entries from ${profile}"
  fi
}

remove_from_profile "${HOME}/.zshrc"
remove_from_profile "${HOME}/.bashrc"
remove_from_profile "${HOME}/.bash_profile"
remove_from_profile "${HOME}/.config/fish/config.fish"

# Remove shell completion files installed for talos and the 'oo' alias.
remove_completion() {
  local file="$1"
  if [ -e "${file}" ]; then
    rm -f "${file}"
    info "Removed completion ${file}"
  fi
}

# zsh
remove_completion "${HOME}/.zsh/_oo"
remove_completion "${HOME}/.zsh/_talos"
# bash
remove_completion "${HOME}/.local/share/bash-completion/completions/oo"
remove_completion "${HOME}/.local/share/bash-completion/completions/talos"
# fish
remove_completion "${HOME}/.config/fish/completions/oo.fish"
remove_completion "${HOME}/.config/fish/completions/talos.fish"

echo ""
success "${BINARY} was uninstalled successfully."
info "Restart your shell to finish cleaning up your environment."
