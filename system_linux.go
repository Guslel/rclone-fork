package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

type MountSupport struct {
	OK         bool   `json:"ok"`
	Falta      string `json:"falta,omitempty"`
	ComoFazer  string `json:"comoFazer,omitempty"`
	Automatico bool   `json:"automatico"`
}

func mountSupport() MountSupport {
	for _, b := range []string{"fusermount3", "fusermount"} {
		if _, err := exec.LookPath(b); err == nil {
			return MountSupport{OK: true}
		}
	}
	return MountSupport{Falta: "FUSE", ComoFazer: "No terminal, rode: sudo apt install fuse3"}
}

func installMountSupport() (string, error) {
	return "", fmt.Errorf("no Linux, instale pelo terminal: sudo apt install fuse3")
}

// Autostart uses the desktop's standard autostart folder (XDG), which every
// common Linux desktop reads at login.
func autostartFile() string {
	base, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(base, "autostart", "rclone-painel.desktop")
}

func autostartEnabled() (bool, bool) {
	f := autostartFile()
	return f != "" && fileExists(f), f != ""
}

func setAutostart(on bool) error {
	f := autostartFile()
	if f == "" {
		return fmt.Errorf("pasta de inicialização não encontrada")
	}
	if !on {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	if err := os.MkdirAll(filepath.Dir(f), 0o755); err != nil {
		return err
	}
	content := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=Painel do rclone (segundo plano)
Comment=Mantém as automações do rclone rodando
Exec="%s" --segundo-plano
Terminal=false
X-GNOME-Autostart-enabled=true
`, exe)
	return os.WriteFile(f, []byte(content), 0o644)
}
