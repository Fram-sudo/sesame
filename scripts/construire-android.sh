#!/usr/bin/env bash
# Construit l'APK pour téléphone ARM 64 bits (Galaxy S25) puis le signe.
# Prérequis Windows : Mode développeur activé (liens symboliques).
set -euo pipefail
cd "$(dirname "$0")/.."
# Gradle échoue sous Windows avec le dossier temporaire par défaut (« Unable to establish loopback connection »)
mkdir -p /c/Projets/tmp-java
export JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/Projets/tmp-java"
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.21.9-hotspot"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
export PATH="$JAVA_HOME/bin:$HOME/.cargo/bin:$PATH"
npx tauri android build --apk --target aarch64
bash scripts/signer-apk.sh
