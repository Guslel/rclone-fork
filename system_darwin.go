package main

import "fmt"

type MountSupport struct {
	OK         bool   `json:"ok"`
	Falta      string `json:"falta,omitempty"`
	ComoFazer  string `json:"comoFazer,omitempty"`
	Automatico bool   `json:"automatico"`
}

func mountSupport() MountSupport {
	if fileExists("/Library/Filesystems/macfuse.fs") {
		return MountSupport{OK: true}
	}
	return MountSupport{Falta: "macFUSE", ComoFazer: "Instale o macFUSE em https://osxfuse.github.io e abra o painel de novo."}
}

func installMountSupport() (string, error) {
	return "", fmt.Errorf("instale o macFUSE em https://osxfuse.github.io")
}

func autostartEnabled() (bool, bool) { return false, false }

func setAutostart(bool) error { return fmt.Errorf("ainda não disponível no macOS") }
