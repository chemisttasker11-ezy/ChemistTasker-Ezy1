#!/bin/sh
set -eu

root=/usr/share/nginx/html
archive=/var/cache/chemisttasker-assets
# Only staging mounts this dedicated public-asset archive.
[ -d "$archive" ] || exit 0

mkdir -p "$archive/js" "$archive/dashboard-assets"
if [ -f "$archive/.active-assets" ]; then
    # Retirement starts now, even when the previous release ran for months.
    while IFS= read -r relative; do
        case "$relative" in js/*|dashboard-assets/*) ;; *) exit 1 ;; esac
        case "$relative" in *../*|*/..) exit 1 ;; esac
        [ ! -f "$archive/$relative" ] || touch "$archive/$relative"
    done < "$archive/.active-assets"
else
    if [ -z "$(find "$archive/js" -type f -print -quit)" ] &&
       [ "${STAGING_ALLOW_EMPTY_FRONTEND_ARCHIVE:-0}" != 1 ]; then
        echo 'Seed the previous frontend assets first; empty archive requires explicit first-install approval.' >&2
        exit 1
    fi
    # Imported files may carry build timestamps, including epoch-zero tar entries.
    find "$archive/js" "$archive/dashboard-assets" -type f -exec touch {} +
fi
manifest=$(mktemp "$archive/.active-assets.XXXXXX")
trap 'rm -f "$manifest"' EXIT
trap 'exit 1' HUP INT TERM
for folder in js dashboard-assets; do
    mkdir -p "$archive/$folder"
    find "$root/$folder" -type f -exec sh -ec '
        root=$1; archive=$2; manifest=$3; shift 3
        for source do
            relative=${source#"$root"/}
            target=$archive/$relative
            mkdir -p "${target%/*}"
            if [ -e "$target" ]; then
                cmp -s "$source" "$target" || {
                    echo "Refusing changed content at retained asset $relative" >&2
                    exit 1
                }
            else
                temporary=$(mktemp "$target.XXXXXX")
                cp "$source" "$temporary"
                chmod 644 "$temporary"
                mv "$temporary" "$target"
            fi
            touch "$target"
            printf "%s\n" "$relative" >> "$manifest"
        done
    ' sh "$root" "$archive" "$manifest" {} +
    # Keep retired assets beyond their 30-day browser cache lifetime.
    find "$archive/$folder" -type f -mtime +31 -delete
done
mv "$manifest" "$archive/.active-assets"
trap - EXIT HUP INT TERM
