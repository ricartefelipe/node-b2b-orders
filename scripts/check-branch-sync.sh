#!/usr/bin/env bash
# Verificação somente leitura do alinhamento entre duas branches publicadas.
#
# Substitui a promoção automática que fazia `git reset --hard origin/develop` em `master` seguido de
# `git push --force-with-lease`: aquilo descartava sem aviso qualquer commit que existisse apenas em
# `master` (um hotfix, por exemplo). Aqui nada é escrito no remoto — o resultado é um relato.
#
# Uso: check-branch-sync.sh [remote] [origem] [destino]
#   "a origem está contida no destino?"  Ex.: check-branch-sync.sh origin develop master
set -euo pipefail

remote="${1:-origin}"
source_branch="${2:-develop}"
target_branch="${3:-master}"

note() {
    local level="$1" text="$2"
    printf '%s\n' "$text"
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
        printf -- '- %s\n' "$text" >>"$GITHUB_STEP_SUMMARY"
    fi
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        printf '::%s::%s\n' "$level" "$text"
    fi
}

published() {
    git ls-remote --heads "$remote" "refs/heads/$1" 2>/dev/null | awk 'NF {print $1}'
}

source_sha="$(published "$source_branch")"
target_sha="$(published "$target_branch")"

if [ -z "$source_sha" ]; then
    note notice "GitFlow: '$source_branch' não existe em '$remote'. Nada a verificar e nada foi criado."
    exit 0
fi
if [ -z "$target_sha" ]; then
    note notice "GitFlow: '$target_branch' não existe em '$remote'. Nada a verificar e nada foi criado."
    exit 0
fi

git fetch --quiet --no-tags "$remote" \
    "refs/heads/$source_branch:refs/remotes/sync-check/$source_branch" \
    "refs/heads/$target_branch:refs/remotes/sync-check/$target_branch"

source_ref="refs/remotes/sync-check/$source_branch"
target_ref="refs/remotes/sync-check/$target_branch"

if [ "$source_sha" = "$target_sha" ]; then
    note notice "GitFlow: '$source_branch' e '$target_branch' apontam para o mesmo commit \
($(git rev-parse --short "$target_ref")). Em sincronia."
    exit 0
fi

missing="$(git rev-list --count "$target_ref..$source_ref")"
only_target="$(git rev-list --count "$source_ref..$target_ref")"

if [ "$missing" -eq 0 ]; then
    note notice "GitFlow: '$target_branch' já contém todo o conteúdo de '$source_branch' e está \
$only_target commit(s) à frente. Nada a sincronizar."
    exit 0
fi

note warning "GitFlow: '$target_branch' está $missing commit(s) atrás de '$source_branch' \
(e $only_target à frente). Promova por PR de '$source_branch' para '$target_branch' — esta \
verificação não altera branches. Os $only_target commit(s) exclusivos de '$target_branch' seriam \
perdidos por um reset, e é por isso que ele não acontece mais aqui."

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        printf '\n### Commits em `%s` ausentes em `%s`\n\n' "$source_branch" "$target_branch"
        git log --no-merges --format='- `%h` %s' "$target_ref..$source_ref" | head -20
    } >>"$GITHUB_STEP_SUMMARY"
fi
git log --no-merges --oneline "$target_ref..$source_ref" | head -20
exit 0
