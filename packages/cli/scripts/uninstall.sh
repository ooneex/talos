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
#
# The installer appends a block of the form:
#   <blank line>
#   # talos
#   export PATH="..."
# so removal also drops the single blank separator line that precedes the
# marker, ensuring repeated install/uninstall cycles never leave behind
# accumulating blank lines or duplicate content.
remove_from_profile() {
  local profile="$1"
  [ -f "${profile}" ] || return 0
  [ -w "${profile}" ] || return 0

  if grep -qsF "${bin_dir}" "${profile}" 2>/dev/null ||
    grep -qsF "# talos" "${profile}" 2>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    # Buffer blank lines so the separator preceding the '# talos' block can be
    # dropped. Remove the marker and its following PATH line, plus any leftover
    # 'oo' alias lines from older installs.
    awk -v bindir="${bin_dir}" -v al="${ALIAS}" '
      /^[[:space:]]*$/ { blanks++; next }
      {
        if ($0 == "# talos") {
          if (blanks > 0) blanks--
          for (i = 0; i < blanks; i++) print ""
          blanks = 0
          skip = 1
          next
        }
        for (i = 0; i < blanks; i++) print ""
        blanks = 0
        if (skip == 1) { skip = 0; next }
        if (index($0, bindir) > 0) next
        if ($0 ~ ("alias " al "=")) next
        if ($0 ~ ("alias " al " ")) next
        print
      }
      END { for (i = 0; i < blanks; i++) print "" }
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
