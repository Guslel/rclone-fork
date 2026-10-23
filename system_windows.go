package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

type MountSupport struct {
	OK         bool   `json:"ok"`
	Falta      string `json:"falta,omitempty"`
	ComoFazer  string `json:"comoFazer,omitempty"`
	Automatico bool   `json:"automatico"`
}

// WinFsp is the driver rclone needs to mount clouds as drives on Windows.
func winfspInstalled() bool {
	for _, k := range []string{`SOFTWARE\WOW6432Node\WinFsp`, `SOFTWARE\WinFsp`} {
		key, err := registry.OpenKey(registry.LOCAL_MACHINE, k, registry.QUERY_VALUE)
		if err == nil {
			dir, _, err := key.GetStringValue("InstallDir")
			key.Close()
			if err == nil && fileExists(filepath.Join(dir, "bin")) {
				return true
			}
		}
	}
	return fileExists(filepath.Join(os.Getenv("ProgramFiles(x86)"), "WinFsp", "bin"))
}

func mountSupport() MountSupport {
	if winfspInstalled() {
		return MountSupport{OK: true}
	}
	_, err := exec.LookPath("winget")
	return MountSupport{
		Falta:      "WinFsp",
		ComoFazer:  "Clique em Instalar e aprove a janela do Windows que vai aparecer. Depois feche e abra o painel de novo.",
		Automatico: err == nil,
	}
}

// installMountSupport starts the official WinFsp installer. Windows asks the
// user to approve it (UAC); nothing is installed silently.
func installMountSupport() (string, error) {
	if winget, err := exec.LookPath("winget"); err == nil {
		cmd := exec.Command(winget, "install", "-e", "--id", "WinFsp.WinFsp", "--accept-package-agreements", "--accept-source-agreements")
		if err := cmd.Start(); err != nil {
			return "", err
		}
		return "Instalação do WinFsp iniciada. Aprove a janela do Windows; quando terminar, feche e abra o painel de novo.", nil
	}
	if err := openBrowser("https://winfsp.dev/rel/"); err != nil {
		return "", err
	}
	return "Abrimos a página oficial do WinFsp. Baixe o instalador (.msi), instale e abra o painel de novo.", nil
}

const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const runValue = "RclonePainel"

func autostartEnabled() (bool, bool) {
	key, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false, true
	}
	defer key.Close()
	_, _, err = key.GetStringValue(runValue)
	return err == nil, true
}

func setAutostart(on bool) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	if !on {
		if err := key.DeleteValue(runValue); err != nil && err != registry.ErrNotExist {
			return err
		}
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return key.SetStringValue(runValue, fmt.Sprintf(`"%s" --segundo-plano`, exe))
}
